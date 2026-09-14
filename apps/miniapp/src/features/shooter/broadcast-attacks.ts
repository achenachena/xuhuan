import { addEnemyHazard } from "./enemies";
import { SHOOTER_WIDTH, clamp } from "./constants";
import type { ShooterEnemyEntity, ShooterMutableState, ShooterThreatSnapshot } from "./types";

export const broadcastFamily = (id: string): "chat" | "remix" | "encore" | null =>
  id === "chat-printer" || id === "chat-conductor" ? "chat"
    : id === "remix-deck" || id === "remix-director" ? "remix"
      : id === "encore-fan" || id === "encore-twins" ? "encore" : null;

// The telegraph and emission use the same volley index, so the gap never moves
// under the player between its warning and the actual attack.
export const broadcastGap = (enemy: ShooterEnemyEntity) => (enemy.volley + enemy.id) % 4;
export const broadcastThreat = (enemy: ShooterEnemyEntity, family: string, remaining: number): ShooterThreatSnapshot => ({
  source_id: enemy.id, kind: family === "chat" ? "comment_gap" : family === "remix" ? "vinyl_return" : "heart_beat",
  ticks_remaining: remaining, origin: { x: enemy.x, y: enemy.y },
  target: { x: 450 + broadcastGap(enemy) * 900, y: 5200 }, radius: 500, width: 600,
});

export const fireBroadcast = (state: ShooterMutableState, enemy: ShooterEnemyEntity, family: string, elite: boolean): void => {
  const second = elite && enemy.health * 2 < enemy.maxHealth;
  if (family === "chat") {
    if (elite) {
      for (let lane=0; lane<4; lane++) if (lane!==broadcastGap(enemy)) {
        addEnemyHazard(state,"comment_ribbon",450+lane*900,enemy.y,0,second?66:52,1,100,600,22);
      }
    } else {
      const x=clamp(state.playerX,400,SHOOTER_WIDTH-400);
      addEnemyHazard(state,"comment_ribbon",x,enemy.y,enemy.id%2?12:-12,58,1,85,480,14);
    }
  } else if (family === "remix") {
    for (const direction of [-1,1]) {
      addEnemyHazard(state,"vinyl_disc",clamp(enemy.x+direction*240,220,SHOOTER_WIDTH-220),enemy.y,direction*(second?30:22),elite?64:55,1,100,0,0);
      if (second) addEnemyHazard(state,"vinyl_disc",clamp(enemy.x+direction*360,220,SHOOTER_WIDTH-220),enemy.y-200,-direction*16,52,1,85,0,0);
    }
  } else {
    // Two conductors alternate rather than filling the arena simultaneously.
    if (elite && state.enemies.filter(e=>e.health>0 && state.config.enemies[e.specIndex]?.chassis==="encore-twins").length>1 && enemy.volley%2!==enemy.id%2) return;
    const count=elite?16:10, speed=second?68:55;
    for(let index=0;index<count;index++) {
      const a=index/count*Math.PI*2;
      const vx=Math.round(Math.pow(Math.sin(a),3)*speed);
      const vy=Math.round(-(13*Math.cos(a)-5*Math.cos(2*a)-2*Math.cos(3*a)-Math.cos(4*a))/17*speed)+24;
      addEnemyHazard(state,"encore_heart",enemy.x,enemy.y,vx,vy,1,65,0,0);
    }
  }
};
