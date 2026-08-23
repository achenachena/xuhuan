package action

import (
	"crypto/sha256"
	"encoding/binary"
	"fmt"
)

const (
	playerRadius = 120
	enemyRadius  = 150
	bulletRadius = 55
	beaconRadius = 250
)

var directionVectors = [16]Vec{
	{1000, 0}, {924, 383}, {707, 707}, {383, 924}, {0, 1000}, {-383, 924}, {-707, 707}, {-924, 383},
	{-1000, 0}, {-924, -383}, {-707, -707}, {-383, -924}, {0, -1000}, {383, -924}, {707, -707}, {924, -383},
}

var routePatterns = [3][3]Vec{
	{{760, 4300}, {2840, 3000}, {1800, 1280}},
	{{2840, 4300}, {760, 3000}, {1800, 1280}},
	{{1800, 4100}, {760, 2550}, {2840, 1450}},
}

type enemyEntity struct {
	id, specIndex, x, y, health, fireClock int
}

type projectileEntity struct {
	id, x, y, vx, vy, damage int
	pattern                  string
	grazed                   bool
}

type simulation struct {
	config        Config
	random        randomStream
	tick          int
	playerX       int
	playerY       int
	health        int
	shield        int
	distortion    int
	dashClock     int
	invulnerable  int
	attackClock   int
	routeStep     int
	routeReady    bool
	routeWarpUsed bool
	lastGraze     int
	nextEnemyID   int
	nextBulletID  int
	spawnIndex    int
	kills         int
	routes        int
	emergencyUsed bool
	reconnectFX   int
	dashFX        int
	anchorPulse   int
	routePattern  int
	enemies       []enemyEntity
	projectiles   []projectileEntity
}

func Simulate(config Config, trace InputTrace) (Result, error) {
	if err := normalizeConfig(&config); err != nil {
		return Result{}, err
	}
	frames, err := DecodeTrace(trace, config.MaxTicks)
	if err != nil {
		return Result{}, err
	}
	sim := newSimulation(config)
	finished := false
	won := false
	for _, frame := range frames {
		won, finished = sim.step(frame)
		if finished {
			break
		}
	}
	if !finished {
		return Result{}, ErrIncompleteRoom
	}
	result := sim.result(won)
	if trace.ClientDigest != "" && trace.ClientDigest != result.Digest {
		return Result{}, ErrDigestMismatch
	}
	return result, nil
}

func normalizeConfig(config *Config) error {
	if config.Seed == "" || config.DurationTicks <= 0 || len(config.Enemies) == 0 {
		return fmt.Errorf("action: invalid encounter configuration")
	}
	if config.MaxTicks <= 0 {
		config.MaxTicks = NormalMaxTicks
	}
	if config.DurationTicks > config.MaxTicks {
		return fmt.Errorf("action: duration exceeds trace limit")
	}
	if config.SpawnInterval <= 0 {
		config.SpawnInterval = 180
	}
	if config.MaxAlive <= 0 || config.MaxAlive > MaxEnemies {
		config.MaxAlive = 8
	}
	if config.PlayerHealth <= 0 || config.PlayerMaxHealth <= 0 || config.PlayerHealth > config.PlayerMaxHealth {
		return fmt.Errorf("action: invalid player health")
	}
	if config.Buffs.AttackDamage <= 0 {
		config.Buffs.AttackDamage = 8
	}
	if config.Buffs.AttackInterval <= 0 {
		config.Buffs.AttackInterval = 12
	}
	if config.Buffs.MoveSpeed <= 0 {
		config.Buffs.MoveSpeed = 42
	}
	if config.Buffs.DashCooldown <= 0 {
		config.Buffs.DashCooldown = 240
	}
	if config.Buffs.DistortionGain <= 0 {
		config.Buffs.DistortionGain = 4
	}
	return nil
}

func newSimulation(config Config) *simulation {
	hash := sha256.Sum256([]byte(config.Seed))
	return &simulation{
		config: config, random: randomStream{state: binary.LittleEndian.Uint32(hash[:4])},
		playerX: ArenaWidth / 2, playerY: 5200, health: config.PlayerHealth,
		shield: config.Buffs.StartingShield, lastGraze: -1000,
		routePattern: int(binary.LittleEndian.Uint32(hash[:4]) % uint32(len(routePatterns))),
		enemies:      make([]enemyEntity, 0, config.MaxAlive), projectiles: make([]projectileEntity, 0, 64),
	}
}

func (sim *simulation) step(input InputFrame) (bool, bool) {
	sim.tick++
	if sim.dashClock > 0 {
		sim.dashClock--
	}
	if sim.invulnerable > 0 {
		sim.invulnerable--
	}
	if sim.reconnectFX > 0 {
		sim.reconnectFX--
	}
	if sim.dashFX > 0 {
		sim.dashFX--
	}
	if sim.anchorPulse > 0 {
		sim.anchorPulse--
	}
	sim.movePlayer(input)
	sim.collectBeacon()
	sim.spawnEnemies()
	sim.updateEnemies()
	sim.autoAttack()
	sim.updateProjectiles()
	decayInterval := 15 + sim.config.NoiseLevel*3
	if sim.distortion > 0 && sim.tick-sim.lastGraze > 60 && sim.tick%decayInterval == 0 {
		sim.distortion--
	}
	if sim.health <= 0 {
		if sim.config.EmergencyReconnectAvailable && !sim.emergencyUsed {
			sim.emergencyUsed = true
			sim.health = max(1, sim.config.PlayerMaxHealth*40/100)
			sim.projectiles = sim.projectiles[:0]
			sim.invulnerable = 45
			sim.reconnectFX = 90
		} else {
			return false, true
		}
	}
	if sim.config.Kind == "boss" {
		for _, enemy := range sim.enemies {
			if sim.config.Enemies[enemy.specIndex].Pattern == "boss" && enemy.health > 0 {
				if sim.tick >= sim.config.MaxTicks {
					return false, true
				}
				return false, false
			}
		}
		return true, true
	}
	if sim.config.Kind == "tutorial" && sim.routeWarpUsed {
		return true, true
	}
	if sim.tick >= sim.config.DurationTicks {
		return true, true
	}
	return false, false
}

func (sim *simulation) movePlayer(input InputFrame) {
	vector := directionVectors[input.Direction&15]
	if input.Magnitude > 0 {
		speed := sim.config.Buffs.MoveSpeed * int(input.Magnitude) / 3
		sim.playerX += vector.X * speed / 1000
		sim.playerY += vector.Y * speed / 1000
	}
	if input.Skill && sim.dashClock == 0 {
		startX, startY := sim.playerX, sim.playerY
		if input.Magnitude == 0 {
			vector = directionVectors[12]
		}
		sim.playerX += vector.X * 620 / 1000
		sim.playerY += vector.Y * 620 / 1000
		sim.invulnerable = 12
		sim.dashFX = 10
		sim.dashClock = sim.config.Buffs.DashCooldown
		empowered := sim.routeReady
		radius, damage := 330, max(4, sim.config.Buffs.DashDamage/2)
		if empowered {
			radius, damage = 700, max(12, sim.config.Buffs.DashDamage)
		}
		midpointX, midpointY := (startX+sim.playerX)/2, (startY+sim.playerY)/2
		for index := range sim.enemies {
			if nearTravelPath(sim.enemies[index].x, sim.enemies[index].y, startX, startY, midpointX, midpointY, sim.playerX, sim.playerY, radius) {
				sim.enemies[index].health -= damage
			}
		}
		kept := sim.projectiles[:0]
		for _, bullet := range sim.projectiles {
			if !nearTravelPath(bullet.x, bullet.y, startX, startY, midpointX, midpointY, sim.playerX, sim.playerY, radius) {
				kept = append(kept, bullet)
			}
		}
		sim.projectiles = kept
		if empowered {
			sim.routeReady = false
			sim.routeWarpUsed = true
		}
	}
	sim.playerX = clamp(sim.playerX, playerRadius, ArenaWidth-playerRadius)
	sim.playerY = clamp(sim.playerY, 700, ArenaHeight-playerRadius)
}

func (sim *simulation) collectBeacon() {
	beacon := sim.activeBeacon()
	if distanceSquared(sim.playerX, sim.playerY, beacon.X, beacon.Y) > (playerRadius+beaconRadius)*(playerRadius+beaconRadius) {
		return
	}
	sim.anchorPulse = 18
	kept := sim.projectiles[:0]
	for _, bullet := range sim.projectiles {
		if distanceSquared(sim.playerX, sim.playerY, bullet.x, bullet.y) > 720*720 {
			kept = append(kept, bullet)
		}
	}
	sim.projectiles = kept
	pulseDamage := max(2, sim.config.Buffs.AttackDamage/2)
	for index := range sim.enemies {
		if distanceSquared(sim.playerX, sim.playerY, sim.enemies[index].x, sim.enemies[index].y) <= 620*620 {
			sim.enemies[index].health -= pulseDamage
		}
	}
	sim.routeStep++
	if sim.routeStep == 3 {
		sim.routeStep = 0
		sim.routeReady = true
		sim.routes++
		sim.dashClock = 0
		if sim.config.Buffs.RouteHeal > 0 {
			sim.health = min(sim.config.PlayerMaxHealth, sim.health+sim.config.Buffs.RouteHeal)
		}
	}
}

func (sim *simulation) activeBeacon() Vec {
	pattern := routePatterns[(sim.routePattern+sim.routes)%len(routePatterns)]
	return pattern[sim.routeStep]
}

func (sim *simulation) spawnEnemies() {
	if len(sim.enemies) >= sim.config.MaxAlive {
		return
	}
	shouldSpawn := sim.tick == 1 || (sim.config.Kind != "boss" && sim.tick%sim.config.SpawnInterval == 0 && sim.tick < sim.config.DurationTicks-90)
	if !shouldSpawn {
		return
	}
	specIndex := sim.spawnIndex % len(sim.config.Enemies)
	spec := sim.config.Enemies[specIndex]
	sim.spawnIndex++
	edge := sim.random.intn(3)
	x, y := 300+sim.random.intn(ArenaWidth-600), 850
	if edge == 1 {
		x, y = 280, 900+sim.random.intn(2800)
	}
	if edge == 2 {
		x, y = ArenaWidth-280, 900+sim.random.intn(2800)
	}
	if spec.Pattern == "boss" {
		x, y = ArenaWidth/2, 1200
	}
	sim.nextEnemyID++
	health := spec.MaxHealth + spec.MaxHealth*sim.config.NoiseLevel/10
	sim.enemies = append(sim.enemies, enemyEntity{id: sim.nextEnemyID, specIndex: specIndex, x: x, y: y, health: health})
}

func (sim *simulation) updateEnemies() {
	for index := range sim.enemies {
		enemy := &sim.enemies[index]
		if enemy.health <= 0 {
			continue
		}
		spec := sim.config.Enemies[enemy.specIndex]
		dx, dy := sim.playerX-enemy.x, sim.playerY-enemy.y
		distance := max(1, integerSqrt(dx*dx+dy*dy))
		interval := max(20, spec.FireInterval-sim.config.NoiseLevel*3)
		telegraphing := spec.FireInterval > 0 && interval-enemy.fireClock <= sim.intentWindow()
		sim.moveEnemy(enemy, spec, dx, dy, distance, telegraphing)
		if distance < playerRadius+enemyRadius && sim.invulnerable == 0 {
			sim.damagePlayer(max(1, spec.ContactDamage))
			sim.invulnerable = 18
		}
		enemy.fireClock++
		if spec.FireInterval > 0 && enemy.fireClock >= interval && len(sim.projectiles) < MaxProjectiles {
			enemy.fireClock = 0
			sim.fireEnemyAttack(enemy, spec, dx, dy, distance, interval)
		}
	}
	alive := sim.enemies[:0]
	for _, enemy := range sim.enemies {
		if enemy.health > 0 {
			alive = append(alive, enemy)
		} else {
			sim.kills++
		}
	}
	sim.enemies = alive
}

func (sim *simulation) moveEnemy(enemy *enemyEntity, spec EnemySpec, dx, dy, distance int, telegraphing bool) {
	moveX, moveY := 0, 0
	switch spec.Pattern {
	case "chaser", "swarm", "boss":
		moveX, moveY = dx*spec.Speed/distance, dy*spec.Speed/distance
	case "sweeper":
		direction := 1
		if ((sim.tick + enemy.id*37) / 105 & 1) != 0 {
			direction = -1
		}
		moveX = direction * spec.Speed
		moveY = clamp(dy/90, -spec.Speed, spec.Speed)
	case "mine":
		if distance > 1450 {
			moveX, moveY = dx*spec.Speed/distance, dy*spec.Speed/distance
		}
	case "orbiter", "sniper":
		orbitDirection := 1
		if enemy.id&1 != 0 {
			orbitDirection = -1
		}
		preferred := 1500
		if spec.Pattern == "sniper" {
			preferred = 2450
		}
		radial := 0
		if distance > preferred+260 {
			radial = 1
		} else if distance < preferred-260 {
			radial = -1
		}
		moveX = dx*spec.Speed*radial/distance + -dy*spec.Speed*orbitDirection/(distance*2)
		moveY = dy*spec.Speed*radial/distance + dx*spec.Speed*orbitDirection/(distance*2)
	case "charger":
		if !telegraphing {
			moveX, moveY = dx*spec.Speed/distance, dy*spec.Speed/distance
		}
	}
	enemy.x = clamp(enemy.x+moveX, enemyRadius, ArenaWidth-enemyRadius)
	enemy.y = clamp(enemy.y+moveY, 700, ArenaHeight-enemyRadius)
}

func (sim *simulation) fireEnemyAttack(enemy *enemyEntity, spec EnemySpec, dx, dy, distance, interval int) {
	switch spec.Pattern {
	case "boss":
		sim.fireBossVolley(enemy, spec, dx, dy, distance, interval)
	case "mine":
		speed := max(12, spec.ProjectileSpeed)
		for index := 0; index < 16; index += 2 {
			vector := directionVectors[index]
			sim.fireProjectileVelocity(*enemy, spec, vector.X*speed/1000, vector.Y*speed/1000)
		}
	case "orbiter":
		speed := max(12, spec.ProjectileSpeed)
		start := (sim.tick / interval * 2) & 15
		for index := 0; index < 16; index += 4 {
			vector := directionVectors[(start+index)&15]
			sim.fireProjectileVelocity(*enemy, spec, vector.X*speed/1000, vector.Y*speed/1000)
		}
	case "charger":
		enemy.x = clamp(enemy.x+dx*860/distance, enemyRadius, ArenaWidth-enemyRadius)
		enemy.y = clamp(enemy.y+dy*860/distance, 700, ArenaHeight-enemyRadius)
	case "sweeper", "sniper":
		speed := max(12, spec.ProjectileSpeed)
		vx, vy := dx*speed/distance, dy*speed/distance
		spread := 4
		if spec.Pattern == "sniper" {
			spread = 2
		}
		sim.fireProjectileVelocity(*enemy, spec, vx, vy)
		sim.fireProjectileVelocity(*enemy, spec, (vx*10-vy*spread)/10, (vy*10+vx*spread)/10)
		sim.fireProjectileVelocity(*enemy, spec, (vx*10+vy*spread)/10, (vy*10-vx*spread)/10)
	default:
		sim.fireProjectile(*enemy, spec, dx, dy, distance)
	}
}

func (sim *simulation) fireProjectile(enemy enemyEntity, spec EnemySpec, dx, dy, distance int) {
	speed := max(12, spec.ProjectileSpeed)
	sim.fireProjectileVelocity(enemy, spec, dx*speed/distance, dy*speed/distance)
}

func (sim *simulation) fireProjectileVelocity(enemy enemyEntity, spec EnemySpec, vx, vy int) {
	if len(sim.projectiles) >= MaxProjectiles {
		return
	}
	sim.nextBulletID++
	sim.projectiles = append(sim.projectiles, projectileEntity{
		id: sim.nextBulletID, x: enemy.x, y: enemy.y,
		vx: vx, vy: vy, damage: max(1, spec.ProjectileDamage), pattern: spec.Pattern,
	})
}

func (sim *simulation) fireBossVolley(enemy *enemyEntity, spec EnemySpec, dx, dy, distance, interval int) {
	speed := max(12, spec.ProjectileSpeed)
	switch bossPhase(enemy.health, spec.MaxHealth) {
	case 1:
		vector := directionVectors[(sim.tick/interval*2)&15]
		sim.fireProjectileVelocity(*enemy, spec, vector.X*speed/1000, vector.Y*speed/1000)
	case 2:
		switch sim.bossMimic() {
		case "distortion":
			vx, vy := dx*speed/distance, dy*speed/distance
			sim.fireProjectileVelocity(*enemy, spec, vx, vy)
			sim.fireProjectileVelocity(*enemy, spec, (vx*9-vy*4)/10, (vy*9+vx*4)/10)
			sim.fireProjectileVelocity(*enemy, spec, (vx*9+vy*4)/10, (vy*9-vx*4)/10)
		case "echo":
			sim.fireProjectile(*enemy, spec, dx, dy, distance)
			enemy.health = min(spec.MaxHealth, enemy.health+max(1, spec.MaxHealth/200))
		default:
			enemy.x = clamp(enemy.x+dx*280/distance, enemyRadius, ArenaWidth-enemyRadius)
			enemy.y = clamp(enemy.y+dy*280/distance, 700, ArenaHeight-enemyRadius)
			sim.fireProjectile(*enemy, spec, dx, dy, distance)
		}
	default:
		for index := 0; index < 16; index += 2 {
			vector := directionVectors[index]
			sim.fireProjectileVelocity(*enemy, spec, vector.X*speed/1000, vector.Y*speed/1000)
		}
	}
}

func bossPhase(health, maxHealth int) int {
	if health*3 > maxHealth*2 {
		return 1
	}
	if health*3 > maxHealth {
		return 2
	}
	return 3
}

func (sim *simulation) bossMimic() string {
	route := max(0, sim.config.Buffs.DashDamage-14)*2 + sim.config.Buffs.RouteHeal*5 + max(0, 240-sim.config.Buffs.DashCooldown)/5
	distortion := sim.config.Buffs.OverloadBonus + max(0, sim.config.Buffs.DistortionGain-4)*8
	echo := sim.config.Buffs.StartingShield*3 + sim.config.Buffs.ReflectDamage*6
	if distortion > route && distortion >= echo {
		return "distortion"
	}
	if echo > route && echo > distortion {
		return "echo"
	}
	return "route"
}

func (sim *simulation) autoAttack() {
	sim.attackClock++
	if sim.attackClock < sim.config.Buffs.AttackInterval {
		return
	}
	sim.attackClock = 0
	nearest, nearestDistance := -1, int(^uint(0)>>1)
	for index, enemy := range sim.enemies {
		distance := distanceSquared(sim.playerX, sim.playerY, enemy.x, enemy.y)
		if enemy.health > 0 && distance < nearestDistance {
			nearest, nearestDistance = index, distance
		}
	}
	if nearest < 0 {
		return
	}
	damage := sim.config.Buffs.AttackDamage
	if sim.distortion >= 60 {
		damage += damage * max(25, sim.config.Buffs.OverloadBonus) / 100
	}
	sim.enemies[nearest].health -= damage
}

func (sim *simulation) updateProjectiles() {
	kept := sim.projectiles[:0]
	for _, bullet := range sim.projectiles {
		bullet.x += bullet.vx
		bullet.y += bullet.vy
		if bullet.x < -100 || bullet.x > ArenaWidth+100 || bullet.y < 500 || bullet.y > ArenaHeight+100 {
			continue
		}
		distance := distanceSquared(sim.playerX, sim.playerY, bullet.x, bullet.y)
		if distance <= (playerRadius+bulletRadius)*(playerRadius+bulletRadius) {
			if sim.invulnerable == 0 {
				sim.damagePlayer(bullet.damage)
				sim.invulnerable = 10
			}
			continue
		}
		if !bullet.grazed && distance <= 310*310 {
			bullet.grazed = true
			sim.lastGraze = sim.tick
			sim.distortion += sim.config.Buffs.DistortionGain + sim.config.NoiseLevel
			if sim.distortion >= 100 {
				sim.damagePlayer(12)
				sim.distortion = min(55, 40+sim.config.NoiseLevel*5)
				sim.projectiles = sim.projectiles[:0]
				return
			}
		}
		kept = append(kept, bullet)
	}
	sim.projectiles = kept
}

func (sim *simulation) damagePlayer(amount int) {
	if sim.shield > 0 {
		absorbed := min(sim.shield, amount)
		sim.shield -= absorbed
		amount -= absorbed
		if absorbed > 0 && sim.config.Buffs.ReflectDamage > 0 {
			for index := range sim.enemies {
				if distanceSquared(sim.playerX, sim.playerY, sim.enemies[index].x, sim.enemies[index].y) < 800*800 {
					sim.enemies[index].health -= sim.config.Buffs.ReflectDamage
				}
			}
		}
	}
	if amount > 0 {
		sim.health -= amount
	}
}

func (sim *simulation) result(won bool) Result {
	final := sim.snapshot()
	digest := fmt.Sprintf("%08x", fnv32([]uint32{
		uint32(sim.tick), uint32(max(0, sim.health)), uint32(sim.kills), uint32(sim.routes),
		uint32(sim.distortion), boolInt(sim.emergencyUsed), boolInt(won),
	}))
	return Result{Won: won, Health: max(0, sim.health), Ticks: sim.tick, Kills: sim.kills,
		RoutesCompleted: sim.routes, Distortion: sim.distortion, EmergencyReconnectUsed: sim.emergencyUsed,
		Digest: digest, Final: final}
}

func (sim *simulation) snapshot() Snapshot {
	enemies := make([]EnemySnapshot, 0, len(sim.enemies))
	for _, enemy := range sim.enemies {
		spec := sim.config.Enemies[enemy.specIndex]
		phase, mimic := 0, ""
		if spec.Pattern == "boss" {
			phase, mimic = bossPhase(enemy.health, spec.MaxHealth), sim.bossMimic()
		}
		intentTicks, intentTarget := sim.enemyIntent(enemy, spec, phase)
		enemies = append(enemies, EnemySnapshot{ID: enemy.id, Slug: spec.Slug, Pattern: spec.Pattern, Position: Vec{enemy.x, enemy.y}, Health: enemy.health, MaxHealth: spec.MaxHealth, Boss: spec.Pattern == "boss", BossPhase: phase, BossMimic: mimic, IntentTicks: intentTicks, IntentTarget: intentTarget})
	}
	projectiles := make([]ProjectileSnapshot, 0, len(sim.projectiles))
	for _, bullet := range sim.projectiles {
		projectiles = append(projectiles, ProjectileSnapshot{ID: bullet.id, Pattern: bullet.pattern, Position: Vec{bullet.x, bullet.y}, Velocity: Vec{bullet.vx, bullet.vy}, Grazed: bullet.grazed})
	}
	return Snapshot{Tick: sim.tick, Player: Vec{sim.playerX, sim.playerY}, Health: max(0, sim.health), MaxHealth: sim.config.PlayerMaxHealth,
		Shield: sim.shield, Distortion: sim.distortion, DashCooldown: sim.dashClock, Invulnerable: sim.invulnerable, ReconnectFX: sim.reconnectFX,
		DashFX: sim.dashFX, AnchorPulse: sim.anchorPulse, RouteStep: sim.routeStep, RouteReady: sim.routeReady, ActiveBeacon: sim.activeBeacon(), Enemies: enemies, Projectiles: projectiles}
}

func (sim *simulation) enemyIntent(enemy enemyEntity, spec EnemySpec, phase int) (int, Vec) {
	if spec.FireInterval <= 0 {
		return 0, Vec{}
	}
	interval := max(20, spec.FireInterval-sim.config.NoiseLevel*3)
	remaining := interval - enemy.fireClock
	telegraphWindow := sim.intentWindow()
	if remaining <= 0 || remaining > telegraphWindow {
		return 0, Vec{}
	}
	if phase == 1 {
		vector := directionVectors[((sim.tick+remaining)/interval*2)&15]
		return remaining, Vec{enemy.x + vector.X*3, enemy.y + vector.Y*3}
	}
	if spec.Pattern == "mine" {
		return remaining, Vec{enemy.x, enemy.y}
	}
	if spec.Pattern == "orbiter" {
		start := ((sim.tick + remaining) / interval * 2) & 15
		vector := directionVectors[start]
		return remaining, Vec{enemy.x + vector.X*3, enemy.y + vector.Y*3}
	}
	return remaining, Vec{sim.playerX, sim.playerY}
}

func (sim *simulation) intentWindow() int {
	return max(8, 15-sim.config.NoiseLevel*2)
}

type randomStream struct{ state uint32 }

func (stream *randomStream) next() uint32 {
	if stream.state == 0 {
		stream.state = 0x9e3779b9
	}
	x := stream.state
	x ^= x << 13
	x ^= x >> 17
	x ^= x << 5
	stream.state = x
	return x
}
func (stream *randomStream) intn(limit int) int {
	if limit <= 1 {
		return 0
	}
	return int(stream.next() % uint32(limit))
}

func integerSqrt(value int) int {
	if value <= 0 {
		return 0
	}
	x := value
	y := (x + 1) / 2
	for y < x {
		x = y
		y = (x + value/x) / 2
	}
	return x
}
func distanceSquared(ax, ay, bx, by int) int { dx, dy := ax-bx, ay-by; return dx*dx + dy*dy }
func nearTravelPath(x, y, startX, startY, midpointX, midpointY, endX, endY, radius int) bool {
	distance := min(
		distanceSquared(x, y, startX, startY),
		distanceSquared(x, y, midpointX, midpointY),
		distanceSquared(x, y, endX, endY),
	)
	return distance <= radius*radius
}
func clamp(value, low, high int) int { return min(high, max(low, value)) }
func boolInt(value bool) uint32 {
	if value {
		return 1
	}
	return 0
}
func fnv32(values []uint32) uint32 {
	hash := uint32(2166136261)
	for _, value := range values {
		for shift := uint(0); shift < 32; shift += 8 {
			hash ^= (value >> shift) & 0xff
			hash *= 16777619
		}
	}
	return hash
}
