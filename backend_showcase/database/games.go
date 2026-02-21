package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// Game mirrors the games table.
type Game struct {
	ID              int             `json:"id"`
	Name            string          `json:"name"`
	DeveloperID     int             `json:"developerId"`
	Types           []string        `json:"types"`
	RvbServices     []string        `json:"rvbServices"`
	Credentials     json.RawMessage `json:"credentials"`
	TeamCount       int             `json:"teamCount"`
	PresetID        *string         `json:"presetId"`
	BlackTeamCidr   *string         `json:"blackTeamCidr"`
	NetworkSnapshot json.RawMessage `json:"networkSnapshot,omitempty"`
	CreatedAt       time.Time       `json:"createdAt"`
	UpdatedAt       time.Time       `json:"updatedAt"`
}

// ListGamesForDeveloper returns all games owned by a developer.
func ListGamesForDeveloper(ctx context.Context, developerID int) ([]Game, error) {
	rows, err := DB.QueryContext(ctx,
		`SELECT id, name, developer_id, types, rvb_services, credentials,
		        team_count, preset_id, black_team_cidr, network_snapshot,
		        created_at, updated_at
		 FROM games WHERE developer_id = $1
		 ORDER BY created_at DESC`, developerID,
	)
	if err != nil {
		return nil, fmt.Errorf("list games: %w", err)
	}
	defer rows.Close()

	var games []Game
	for rows.Next() {
		g := Game{}
		var types, services []string
		var presetID, blackTeamCidr sql.NullString
		var snapshot []byte
		err := rows.Scan(
			&g.ID, &g.Name, &g.DeveloperID,
			&types, &services,
			&g.Credentials, &g.TeamCount,
			&presetID, &blackTeamCidr, &snapshot,
			&g.CreatedAt, &g.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan game: %w", err)
		}
		g.Types = types
		g.RvbServices = services
		if presetID.Valid {
			g.PresetID = &presetID.String
		}
		if blackTeamCidr.Valid {
			g.BlackTeamCidr = &blackTeamCidr.String
		}
		if snapshot != nil {
			g.NetworkSnapshot = snapshot
		}
		games = append(games, g)
	}
	return games, rows.Err()
}

// GetGameByID fetches a single game.
func GetGameByID(ctx context.Context, id int) (*Game, error) {
	g := &Game{}
	var types, services []string
	var presetID, blackTeamCidr sql.NullString
	var snapshot []byte
	err := DB.QueryRowContext(ctx,
		`SELECT id, name, developer_id, types, rvb_services, credentials,
		        team_count, preset_id, black_team_cidr, network_snapshot,
		        created_at, updated_at
		 FROM games WHERE id = $1`, id,
	).Scan(
		&g.ID, &g.Name, &g.DeveloperID,
		&types, &services,
		&g.Credentials, &g.TeamCount,
		&presetID, &blackTeamCidr, &snapshot,
		&g.CreatedAt, &g.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get game: %w", err)
	}
	g.Types = types
	g.RvbServices = services
	if presetID.Valid {
		g.PresetID = &presetID.String
	}
	if blackTeamCidr.Valid {
		g.BlackTeamCidr = &blackTeamCidr.String
	}
	if snapshot != nil {
		g.NetworkSnapshot = snapshot
	}
	return g, nil
}

// CreateGame inserts a new game.
func CreateGame(ctx context.Context, g *Game) error {
	if g.Credentials == nil {
		g.Credentials = json.RawMessage("[]")
	}
	var presetID, cidr sql.NullString
	if g.PresetID != nil {
		presetID = sql.NullString{String: *g.PresetID, Valid: true}
	}
	if g.BlackTeamCidr != nil {
		cidr = sql.NullString{String: *g.BlackTeamCidr, Valid: true}
	}
	err := DB.QueryRowContext(ctx,
		`INSERT INTO games (name, developer_id, types, rvb_services, credentials, team_count, preset_id, black_team_cidr, network_snapshot)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING id, created_at, updated_at`,
		g.Name, g.DeveloperID, g.Types, g.RvbServices,
		g.Credentials, g.TeamCount,
		presetID, cidr, g.NetworkSnapshot,
	).Scan(&g.ID, &g.CreatedAt, &g.UpdatedAt)
	if err != nil {
		return fmt.Errorf("create game: %w", err)
	}
	return nil
}

// UpdateGame updates mutable game fields.
func UpdateGame(ctx context.Context, g *Game) error {
	var presetID, cidr sql.NullString
	if g.PresetID != nil {
		presetID = sql.NullString{String: *g.PresetID, Valid: true}
	}
	if g.BlackTeamCidr != nil {
		cidr = sql.NullString{String: *g.BlackTeamCidr, Valid: true}
	}
	_, err := DB.ExecContext(ctx,
		`UPDATE games SET name=$1, types=$2, rvb_services=$3, credentials=$4,
		 team_count=$5, preset_id=$6, black_team_cidr=$7, network_snapshot=$8,
		 updated_at=NOW()
		 WHERE id=$9 AND developer_id=$10`,
		g.Name, g.Types, g.RvbServices, g.Credentials,
		g.TeamCount, presetID, cidr, g.NetworkSnapshot,
		g.ID, g.DeveloperID,
	)
	if err != nil {
		return fmt.Errorf("update game: %w", err)
	}
	return nil
}

// DeleteGame removes a game by ID (cascading to sessions).
func DeleteGame(ctx context.Context, id, developerID int) error {
	result, err := DB.ExecContext(ctx,
		`DELETE FROM games WHERE id = $1 AND developer_id = $2`,
		id, developerID,
	)
	if err != nil {
		return fmt.Errorf("delete game: %w", err)
	}
	if rows, _ := result.RowsAffected(); rows == 0 {
		return fmt.Errorf("game not found")
	}
	return nil
}

// SaveNetworkSnapshot stores the frontend network editor snapshot as JSON.
func SaveNetworkSnapshot(ctx context.Context, gameID int, snapshot json.RawMessage) error {
	_, err := DB.ExecContext(ctx,
		`UPDATE games SET network_snapshot = $1, updated_at = NOW() WHERE id = $2`,
		snapshot, gameID,
	)
	if err != nil {
		return fmt.Errorf("save network snapshot: %w", err)
	}
	return nil
}
