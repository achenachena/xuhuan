package run

import (
	"fmt"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
)

func generateMap(seed string, mode Mode, chapter gamecontent.Chapter, noiseLevel int, tutorialCompleted bool, catalog *gamecontent.Catalog) (MapState, uint64, error) {
	stream := randomStream{seed: seed + ":map:" + chapter.Slug}
	pick := func(pool []string) (string, error) {
		if len(pool) == 0 {
			return "", fmt.Errorf("run: chapter %q has an empty map pool", chapter.Slug)
		}
		return pool[stream.Intn(len(pool))], nil
	}
	combatA, err := pick(chapter.EncounterPool)
	if err != nil {
		return MapState{}, 0, err
	}
	combatB, err := pick(chapter.EncounterPool)
	if err != nil {
		return MapState{}, 0, err
	}
	combatC, err := pick(chapter.EncounterPool)
	if err != nil {
		return MapState{}, 0, err
	}
	combatD, err := pick(chapter.EncounterPool)
	if err != nil {
		return MapState{}, 0, err
	}
	elite, err := pick(chapter.ElitePool)
	if err != nil {
		return MapState{}, 0, err
	}
	event := ""
	if len(chapter.EventPool) > 0 {
		event, err = pick(chapter.EventPool)
		if err != nil {
			return MapState{}, 0, err
		}
	}

	encounterNode := func(id string, layer, lane int, kind NodeType, status NodeStatus, next []string, slug string) MapNode {
		definition, _ := catalog.Encounter(slug)
		return MapNode{ID: id, Layer: layer, Lane: lane, Type: kind, Status: status, Next: next, EncounterSlug: slug, Objective: definition.Objective.Kind, Risk: definition.Risk, RewardBias: definition.RewardBias, EnemySlugs: append([]string{}, definition.EnemySlugs...), Hazards: append([]string{}, definition.Hazards...)}
	}
	if mode == DailyMode {
		nodes := []MapNode{
			encounterNode("daily-1", 0, 0, CombatNode, CurrentNode, []string{"daily-2"}, combatA),
			encounterNode("daily-2", 1, 0, EliteNode, LockedNode, []string{"daily-3"}, elite),
			encounterNode("daily-3", 2, 0, BossNode, LockedNode, nil, chapter.BossEncounterSlug),
		}
		return MapState{Nodes: nodes, CurrentNodeID: "daily-1"}, stream.cursor, nil
	}
	firstStatus := AvailableNode
	nodes := []MapNode{
		encounterNode("l1-a", 1, 0, CombatNode, firstStatus, []string{"l2-a", "l2-b"}, combatA),
		encounterNode("l1-b", 1, 1, CombatNode, firstStatus, []string{"l2-a", "l2-b"}, combatB),
		{ID: "l2-a", Layer: 2, Lane: 0, Type: EventNode, Status: LockedNode, Next: []string{"l3-a", "l3-b"}, EventSlug: event},
		encounterNode("l2-b", 2, 1, CombatNode, LockedNode, []string{"l3-a", "l3-b"}, combatC),
		encounterNode("l3-a", 3, 0, EliteNode, LockedNode, []string{"l4-a"}, elite),
		{ID: "l3-b", Layer: 3, Lane: 1, Type: RestNode, Status: LockedNode, Next: []string{"l4-a"}},
		{ID: "l4-a", Layer: 4, Lane: 0, Type: StoryNode, Status: LockedNode, Next: []string{"l5-a", "l5-b"}, EventSlug: chapter.MidpointEventSlug},
		encounterNode("l5-a", 5, 0, CombatNode, LockedNode, []string{"l6-a"}, combatD),
		encounterNode("l5-b", 5, 1, CombatNode, LockedNode, []string{"l6-a"}, combatA),
		encounterNode("l6-a", 6, 0, BossNode, LockedNode, nil, chapter.BossEncounterSlug),
	}
	if event == "" {
		nodes[2] = encounterNode("l2-a", 2, 0, CombatNode, LockedNode, []string{"l3-a", "l3-b"}, combatB)
	}
	if chapter.MidpointEventSlug == "" {
		nodes[6] = encounterNode("l4-a", 4, 0, CombatNode, LockedNode, []string{"l5-a", "l5-b"}, combatC)
	}
	if noiseLevel >= 2 {
		nodes[0].Next = []string{"l2-a"}
		nodes[1].Next = []string{"l2-b"}
	}
	if noiseLevel >= 3 {
		nodes[5] = encounterNode("l3-b", 3, 1, EliteNode, LockedNode, []string{"l4-a"}, elite)
	}
	if chapter.TutorialEncounterSlug != "" && !tutorialCompleted {
		tutorial := encounterNode("tutorial", 0, 0, TutorialNode, CurrentNode, []string{"l1-a", "l1-b"}, chapter.TutorialEncounterSlug)
		nodes = append([]MapNode{tutorial}, nodes...)
		for index := 1; index <= 2; index++ {
			nodes[index].Status = LockedNode
		}
		return MapState{Nodes: nodes, CurrentNodeID: "tutorial"}, stream.cursor, nil
	}
	return MapState{Nodes: nodes}, stream.cursor, nil
}

func nodeIndex(gameMap MapState, id string) int {
	for index, node := range gameMap.Nodes {
		if node.ID == id {
			return index
		}
	}
	return -1
}
func lockAlternativeNodes(gameMap *MapState, selected MapNode) {
	for index := range gameMap.Nodes {
		node := &gameMap.Nodes[index]
		if node.Layer == selected.Layer && node.ID != selected.ID && node.Status == AvailableNode {
			node.Status = LockedNode
		}
	}
}
func completeCurrentNode(state *State) {
	index := nodeIndex(state.Map, state.Map.CurrentNodeID)
	if index < 0 {
		return
	}
	state.Map.Nodes[index].Status = CompletedNode
	for _, id := range state.Map.Nodes[index].Next {
		next := nodeIndex(state.Map, id)
		if next >= 0 && state.Map.Nodes[next].Status == LockedNode {
			state.Map.Nodes[next].Status = AvailableNode
		}
	}
	state.Map.CurrentNodeID = ""
}
