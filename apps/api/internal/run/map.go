package run

import (
	"fmt"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
)

func generateMap(seed string, noiseLevel int, catalog *gamecontent.Catalog) (MapState, uint64, error) {
	stream := randomStream{seed: seed + ":map"}
	normalEnemies := make([]string, 0)
	eliteEnemies := make([]string, 0)
	for _, enemy := range catalog.Enemies {
		switch enemy.Kind {
		case "normal":
			normalEnemies = append(normalEnemies, enemy.Slug)
		case "elite":
			eliteEnemies = append(eliteEnemies, enemy.Slug)
		}
	}
	if len(normalEnemies) < 4 || len(eliteEnemies) < 2 {
		return MapState{}, 0, fmt.Errorf("run: content needs four normal and two elite enemies")
	}
	eventSlugs := make([]string, 0, len(catalog.Events))
	for _, event := range catalog.Events {
		if event.Slug != "chapter-midpoint" {
			eventSlugs = append(eventSlugs, event.Slug)
		}
	}
	if len(eventSlugs) < 2 {
		return MapState{}, 0, fmt.Errorf("run: content needs random events")
	}

	pickNormal := func(allowPair bool) []string {
		firstIndex := stream.Intn(len(normalEnemies))
		first := normalEnemies[firstIndex]
		result := []string{first}
		if allowPair && noiseLevel >= 1 {
			secondIndex := stream.Intn(len(normalEnemies) - 1)
			if secondIndex >= firstIndex {
				secondIndex++
			}
			result = append(result, normalEnemies[secondIndex])
		}
		return result
	}
	pickEvent := func() string { return eventSlugs[stream.Intn(len(eventSlugs))] }

	nodes := []MapNode{
		{ID: "l1-a", Layer: 1, Lane: 0, Type: CombatNode, Status: AvailableNode, Next: []string{"l2-a", "l2-b"}, EnemySlugs: pickNormal(false)},
		{ID: "l1-b", Layer: 1, Lane: 1, Type: CombatNode, Status: AvailableNode, Next: []string{"l2-a", "l2-b"}, EnemySlugs: pickNormal(true)},
		{ID: "l2-a", Layer: 2, Lane: 0, Type: EventNode, Status: LockedNode, Next: []string{"l3-a"}, EventSlug: pickEvent()},
		{ID: "l2-b", Layer: 2, Lane: 1, Type: RestNode, Status: LockedNode, Next: []string{"l3-a"}},
		{ID: "l3-a", Layer: 3, Lane: 0, Type: StoryNode, Status: LockedNode, Next: []string{"l4-a", "l4-b"}, EventSlug: "chapter-midpoint"},
		{ID: "l4-a", Layer: 4, Lane: 0, Type: CombatNode, Status: LockedNode, Next: []string{"l5-a", "l5-b"}, EnemySlugs: pickNormal(true)},
		{ID: "l4-b", Layer: 4, Lane: 1, Type: EliteNode, Status: LockedNode, Next: []string{"l5-a", "l5-b"}, EnemySlugs: []string{eliteEnemies[stream.Intn(len(eliteEnemies))]}},
		{ID: "l5-a", Layer: 5, Lane: 0, Type: CombatNode, Status: LockedNode, Next: []string{"l6-a", "l6-b"}, EnemySlugs: pickNormal(true)},
		{ID: "l5-b", Layer: 5, Lane: 1, Type: RestNode, Status: LockedNode, Next: []string{"l6-a", "l6-b"}},
		{ID: "l6-a", Layer: 6, Lane: 0, Type: EventNode, Status: LockedNode, Next: []string{"l7-a"}, EventSlug: pickEvent()},
		{ID: "l6-b", Layer: 6, Lane: 1, Type: EliteNode, Status: LockedNode, Next: []string{"l7-a"}, EnemySlugs: []string{eliteEnemies[stream.Intn(len(eliteEnemies))]}},
		{ID: "l7-a", Layer: 7, Lane: 0, Type: BossNode, Status: LockedNode, Next: []string{}},
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
