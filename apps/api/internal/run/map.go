package run

import (
	"fmt"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
)

func generateMap(seed string, noiseLevel int, catalog *gamecontent.Catalog) (MapState, uint64, error) {
	required := []string{"signal-handshake", "dock-pursuit", "comment-storm", "mixed-signal", "cache-purge", "moderation-sweep", "optimal-persona"}
	for _, slug := range required {
		if _, ok := catalog.Encounter(slug); !ok {
			return MapState{}, 0, fmt.Errorf("run: missing encounter %q", slug)
		}
	}
	stream := randomStream{seed: seed + ":map"}
	elite := []string{"cache-purge", "moderation-sweep"}[stream.Intn(2)]
	eventSlugs := make([]string, 0, len(catalog.Events))
	for _, event := range catalog.Events {
		if event.Slug != "chapter-midpoint" {
			eventSlugs = append(eventSlugs, event.Slug)
		}
	}
	if len(eventSlugs) < 2 {
		return MapState{}, 0, fmt.Errorf("run: content needs random events")
	}
	event := eventSlugs[stream.Intn(len(eventSlugs))]
	nodes := []MapNode{
		{ID: "tutorial", Layer: 0, Lane: 0, Type: TutorialNode, Status: CurrentNode, Next: []string{"l1-a", "l1-b"}, EncounterSlug: "signal-handshake"},
		{ID: "l1-a", Layer: 1, Lane: 0, Type: CombatNode, Status: LockedNode, Next: []string{"l2-a", "l2-b"}, EncounterSlug: "dock-pursuit"},
		{ID: "l1-b", Layer: 1, Lane: 1, Type: CombatNode, Status: LockedNode, Next: []string{"l2-a", "l2-b"}, EncounterSlug: "comment-storm"},
		{ID: "l2-a", Layer: 2, Lane: 0, Type: EventNode, Status: LockedNode, Next: []string{"l3-a", "l3-b"}, EventSlug: event},
		{ID: "l2-b", Layer: 2, Lane: 1, Type: CombatNode, Status: LockedNode, Next: []string{"l3-a", "l3-b"}, EncounterSlug: "mixed-signal"},
		{ID: "l3-a", Layer: 3, Lane: 0, Type: EliteNode, Status: LockedNode, Next: []string{"l4-a"}, EncounterSlug: elite},
		{ID: "l3-b", Layer: 3, Lane: 1, Type: RestNode, Status: LockedNode, Next: []string{"l4-a"}},
		{ID: "l4-a", Layer: 4, Lane: 0, Type: CombatNode, Status: LockedNode, Next: []string{"l5-a"}, EncounterSlug: "mixed-signal"},
		{ID: "l5-a", Layer: 5, Lane: 0, Type: StoryNode, Status: LockedNode, Next: []string{"l6-a"}, EventSlug: "chapter-midpoint"},
		{ID: "l6-a", Layer: 6, Lane: 0, Type: BossNode, Status: LockedNode, Next: []string{}, EncounterSlug: "optimal-persona"},
	}
	if noiseLevel >= 2 {
		for index := range nodes {
			switch nodes[index].ID {
			case "l1-a":
				nodes[index].Next = []string{"l2-a"}
			case "l1-b":
				nodes[index].Next = []string{"l2-b"}
			}
		}
	}
	if noiseLevel >= 3 {
		for index := range nodes {
			if nodes[index].ID == "l3-b" {
				nodes[index].Type = EliteNode
				nodes[index].EncounterSlug = "moderation-sweep"
			}
		}
	}
	return MapState{Nodes: nodes, CurrentNodeID: "tutorial"}, stream.cursor, nil
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
