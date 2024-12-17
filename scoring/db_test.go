package scoring

import (
	"fmt"
	"testing"
)

func TestDBconnect(t *testing.T) {
	var points int
	points, _, _ = ScoreDB("172.31.255.32", 3306, "anousith", "changeme", "test")
	fmt.Printf("Points: %d\n", points)
}
