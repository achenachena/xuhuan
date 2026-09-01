package shooter

func (sim *simulation) spawnBoss() {
	if sim.config.Boss == nil || sim.spawnedBoss || len(sim.enemies) >= sim.config.Limits.Enemies {
		return
	}
	sim.spawnedBoss = true
	sim.nextEnemyID++
	sim.enemies = append(sim.enemies, enemyEntity{id: sim.nextEnemyID, specIndex: 0, x: ArenaWidth / 2, y: 900, health: sim.config.Boss.Health, maxHealth: sim.config.Boss.Health, boss: true, phase: 1})
}

func (sim *simulation) updateBoss(enemy *enemyEntity) {
	boss := sim.config.Boss
	if boss == nil || enemy.health <= 0 {
		return
	}
	previousPhase := enemy.phase
	stageIndex := bossStageIndex(enemy.health, enemy.maxHealth, boss.Stages)
	enemy.phase = stageIndex + 1
	stage := boss.Stages[stageIndex]
	if previousPhase != enemy.phase {
		sim.bossPhaseTick = sim.tick
	}
	moveBoss(enemy, boss.ID, stage.MovePattern, sim.tick, sim.playerX)
	enemy.fireClock++
	interval := encoreInterval(stage.FireInterval, sim.config.EncoreLevel, 10)
	if enemy.fireClock >= interval {
		enemy.fireClock = 0
		sim.fireBossPattern(enemy, boss.ID, stage)
		enemy.volley++
	}
}

func bossStageIndex(health, maxHealth int, stages []BossStage) int {
	percent := health * 100 / max(1, maxHealth)
	index := 0
	for candidate, stage := range stages {
		if percent <= stage.HealthThreshold {
			index = candidate
		}
	}
	return clamp(index, 0, len(stages)-1)
}

func moveBoss(enemy *enemyEntity, boss BossID, pattern string, tick, playerX int) {
	direction := 1
	if (tick/90)&1 != 0 {
		direction = -1
	}
	speed := 7
	switch boss {
	case BossPerfectCaptain:
		speed = 5
	case BossPhysicalOriginal:
		speed = 10
	case BossAutoArchiveSystem:
		speed = 12
	}
	switch pattern {
	case "anchor":
		return
	case "mirror":
		target := ArenaWidth - playerX
		enemy.x += clamp(target-enemy.x, -speed, speed)
	case "orbit":
		enemy.x += direction * speed
		enemy.y = 900 + ((tick/20)%9-4)*18
	case "dive":
		enemy.x += direction * speed / 2
		enemy.y = 900 + ((tick%120)-60)*4
	case "sweep":
		enemy.x += direction * speed * 2
	default: // drift
		enemy.x += direction * speed
	}
	enemy.x = clamp(enemy.x, enemyRadius, ArenaWidth-enemyRadius)
	enemy.y = clamp(enemy.y, 500, 1800)
}

func (sim *simulation) fireBossPattern(enemy *enemyEntity, boss BossID, stage BossStage) {
	pattern := stage.ShotPattern
	if pattern == "" {
		pattern = bossDefaultPattern(boss, enemy.phase)
	}
	speed := stage.ProjectileSpeed
	damage := stage.Damage
	switch pattern {
	case "aimed":
		dx, dy := sim.playerX-enemy.x, playerY-enemy.y
		distance := max(1, integerSqrt(square(dx)+square(dy)))
		sim.addEnemyBullet(enemy.x, enemy.y, dx*speed/distance, dy*speed/distance, damage)
	case "delayed":
		dx, dy := sim.playerX-enemy.x, playerY-enemy.y
		distance := max(1, integerSqrt(square(dx)+square(dy)))
		sim.addEnemyHazard("delayed_echo", enemy.x, enemy.y, dx*max(1, speed/2)/distance, dy*max(1, speed/2)/distance, damage, 72, 0, 0)
	case "echo":
		dx, dy := sim.playerX-enemy.x, playerY-enemy.y
		distance := max(1, integerSqrt(square(dx)+square(dy)))
		sim.addEnemyBullet(enemy.x, enemy.y, dx*speed/distance, dy*speed/distance, damage)
		mirrorX := ArenaWidth - enemy.x
		sim.addEnemyHazard("echo_shot", mirrorX, enemy.y+180, -dx*speed/distance, dy*speed/distance, damage, 55, 0, 0)
	case "fan":
		for _, vx := range []int{-speed, -speed / 2, 0, speed / 2, speed} {
			sim.addEnemyBullet(enemy.x, enemy.y, vx, speed, damage)
		}
	case "applause":
		for _, origin := range []int{260, ArenaWidth - 260} {
			dx, dy := sim.playerX-origin, playerY-enemy.y
			distance := max(1, integerSqrt(square(dx)+square(dy)))
			sim.addEnemyHazard("applause", origin, enemy.y, dx*speed/distance, dy*speed/distance, damage, 58, 0, 0)
		}
	case "translation":
		direction := 1
		if enemy.volley&1 != 0 {
			direction = -1
		}
		for _, vx := range []int{-speed / 2, 0, speed / 2} {
			sim.addEnemyHazard("translation_zigzag", enemy.x, enemy.y, vx+direction*speed/3, speed, damage, 55, 0, 0)
		}
	case "beam":
		// Lock the lane to the player's position when the warning resolves.
		// This creates a readable dodge-and-return window instead of placing an
		// unavoidable beam on top of the only horizontal firing line to the Boss.
		x := clamp(sim.playerX, 260, ArenaWidth-260)
		sim.addEnemyHazard("boss_beam", x, enemy.y, 0, max(18, speed/2), damage, 100, 300, 0)
	case "lane", "lanes":
		sim.fireBossFrame(enemy, speed, damage, "boss_lane", 0)
	case "highlight":
		sim.addEnemyHazard("highlight_cut", clamp(sim.playerX, 850, ArenaWidth-850), enemy.y, 0, max(18, speed/2), damage, 70, 1500, 0)
	case "audit":
		sim.fireBossFrame(enemy, speed, damage, "audit_bar", 1)
	case "ring":
		sim.fireRadial(enemy, speed, damage, 0, "boss_ring")
	case "spiral":
		sim.fireRadial(enemy, speed, damage, enemy.volley%12, "boss_spiral")
	case "finale":
		sim.fireRadial(enemy, speed, damage, enemy.volley%12, "finale_ring")
		sim.fireBossFrame(enemy, max(18, speed*3/4), damage, "finale_lane", 2)
	default:
		sim.addEnemyBullet(enemy.x, enemy.y, 0, speed, damage)
	}
	sim.fireBossSpecial(enemy, stage.Special, speed, damage)
	sim.fireStoryChoiceBeat(enemy, speed, damage)
	if sim.config.EncoreLevel >= 3 {
		sim.fireBossRemix(enemy, boss, speed, damage)
	}
}

func (sim *simulation) fireStoryChoiceBeat(enemy *enemyEntity, speed, damage int) {
	if enemy.volley%3 != 0 {
		return
	}
	switch storyChoiceMode(sim.config.StoryChoiceID) {
	case 1:
		x := ArenaWidth - enemy.x
		dx, dy := sim.playerX-x, playerY-enemy.y
		distance := max(1, integerSqrt(square(dx)+square(dy)))
		sim.addEnemyHazard("choice_echo", x, enemy.y, dx*speed/distance, dy*speed/distance, damage, 54, 0, 0)
	case 2:
		sim.fireBossFrame(enemy, speed, damage, "choice_frame", 4)
	}
}

func (sim *simulation) fireRadial(enemy *enemyEntity, speed, damage, offset int, kind string) {
	for index := range 12 {
		angle := (index + offset) % 12
		vx := [...]int{0, 5, 9, 11, 9, 5, 0, -5, -9, -11, -9, -5}[angle] * speed / 11
		vy := [...]int{11, 9, 5, 0, -5, -9, -11, -9, -5, 0, 5, 9}[angle] * speed / 11
		sim.addEnemyHazard(kind, enemy.x, enemy.y, vx, vy, damage, 50, 0, 0)
	}
}

func (sim *simulation) fireBossFrame(enemy *enemyEntity, speed, damage int, kind string, gapOffset int) {
	bossID := BossAutoArchiveSystem
	if sim.config.Boss != nil {
		bossID = sim.config.Boss.ID
	}
	gap := (enemy.volley + int(seedFromString(string(bossID))%5) + gapOffset) % 5
	for lane := range 5 {
		if lane == gap {
			continue
		}
		sim.addEnemyHazard(kind, 360+lane*720, enemy.y, 0, speed, damage, 105, 470, 0)
	}
}

// fireBossSpecial gives every authored stage a concrete second beat. These
// additions use the same small visual grammar as normal hazards, but they
// change where the safe horizontal route is rather than only adding health.
func (sim *simulation) fireBossSpecial(enemy *enemyEntity, special string, speed, damage int) {
	switch special {
	case "tidy-intro", "smile-check", "word-by-word", "prove-the-address":
		x := clamp(sim.playerX, 520, ArenaWidth-520)
		sim.addEnemyHazard("caption_block", x, enemy.y-180, 0, max(14, speed/3), damage, 170, 720, 0)
	case "copied-laugh", "bad-take-echo", "tone-correction", "double-exposure":
		x := ArenaWidth - sim.playerX
		dx, dy := sim.playerX-x, playerY-enemy.y
		distance := max(1, integerSqrt(square(dx)+square(dy)))
		sim.addEnemyHazard("echo_shot", x, enemy.y, dx*speed/distance, dy*speed/distance, damage, 58, 0, 0)
	case "empty-horizon", "delete-loss", "overtime-wall", "nothing-happened":
		x := clamp(enemy.x+(enemy.volley%3-1)*650, 700, ArenaWidth-700)
		sim.addEnemyHazard("black_wall", x, enemy.y-220, 0, max(12, speed/4), damage, 135, 1200, 28)
	case "applause-loop", "carry-the-room":
		for _, origin := range []int{220, ArenaWidth - 220} {
			dx, dy := sim.playerX-origin, playerY-enemy.y
			distance := max(1, integerSqrt(square(dx)+square(dy)))
			sim.addEnemyHazard("applause", origin, enemy.y, dx*speed/distance, dy*speed/distance, damage, 58, 0, 0)
		}
	case "reply-now", "crop-the-miss", "assign-everything", "remove-duplicates":
		sim.fireBossFrame(enemy, speed, damage, "special_frame", 2)
	case "endless-encore", "approved-only", "split-stage", "archive-everyone":
		sim.fireRadial(enemy, max(18, speed*3/4), damage, (enemy.volley*2)%12, "special_spiral")
	case "helpful-rewrite", "erase-the-flowers", "overwrite-drafts":
		for _, x := range []int{900, 2700} {
			sim.addEnemyHazard("caption_block", x, enemy.y-180, 0, max(14, speed/3), damage, 155, 580, 0)
		}
	case "first-take", "copy-position":
		x := ArenaWidth - sim.playerX
		dx, dy := sim.playerX-x, playerY-enemy.y
		distance := max(1, integerSqrt(square(dx)+square(dy)))
		sim.addEnemyHazard("mirror_aim", x, enemy.y, dx*speed/distance, dy*speed/distance, damage, 60, 0, 0)
	case "second-original":
		sim.fireRadial(enemy, speed, damage, 6, "double_exposure")
	case "both-live":
		sim.addEnemyHazard("boss_beam", 760, enemy.y, 0, max(18, speed/2), damage, 100, 280, 0)
		sim.addEnemyHazard("boss_beam", ArenaWidth-760, enemy.y, 0, max(18, speed/2), damage, 100, 280, 0)
	}
}

func (sim *simulation) fireBossRemix(enemy *enemyEntity, boss BossID, speed, damage int) {
	// Encore 3 mixes in the next chapter's hazard family, visibly changing the
	// safe route without inflating boss HP.
	switch boss {
	case BossOptimalNana, BossPerfectHighlight:
		sim.fireBossFrame(enemy, max(18, speed*3/4), damage, "encore_frame", 3)
	case BossAlwaysOnIdol, BossApprovedTranslation:
		sim.addEnemyHazard("horizontal_cut", ArenaWidth-enemy.x, enemy.y-260, 0, max(18, speed/2), damage, 65, 1450, 0)
	case BossPerfectCaptain, BossRealityAuditor:
		sim.fireRadial(enemy, max(18, speed*2/3), damage, (enemy.volley*3)%12, "encore_spiral")
	case BossPhysicalOriginal, BossAutoArchiveSystem:
		x := clamp(ArenaWidth-sim.playerX, 650, ArenaWidth-650)
		sim.addEnemyHazard("black_wall", x, enemy.y-240, 0, max(12, speed/4), damage, 125, 1050, 24)
	}
}

func bossDefaultPattern(boss BossID, phase int) string {
	patterns := map[BossID][3]string{
		BossOptimalNana:         {"aimed", "fan", "ring"},
		BossAlwaysOnIdol:        {"applause", "lanes", "ring"},
		BossPerfectHighlight:    {"highlight", "echo", "fan"},
		BossPerfectCaptain:      {"lanes", "fan", "ring"},
		BossApprovedTranslation: {"translation", "echo", "lanes"},
		BossPhysicalOriginal:    {"aimed", "spiral", "echo"},
		BossRealityAuditor:      {"audit", "lanes", "ring"},
		BossAutoArchiveSystem:   {"fan", "spiral", "finale"},
	}
	set := patterns[boss]
	return set[clamp(phase-1, 0, 2)]
}
