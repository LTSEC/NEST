package database

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// ArchivedGame mirrors the archived_games table.
type ArchivedGame struct {
	ID            int                  `json:"id"`
	SessionID     *int                 `json:"sessionId"`
	GameID        *int                 `json:"gameId"`
	DeveloperID   int                  `json:"developerId"`
	DeveloperName string               `json:"developerName"`
	SessionName   string               `json:"sessionName"`
	StartedAt     time.Time            `json:"startedAt"`
	EndedAt       time.Time            `json:"endedAt"`
	NetworkSummary *string             `json:"networkSummary"`
	Results       []ArchivedGameResult `json:"results"`
	CreatedAt     time.Time            `json:"createdAt"`
}

// ArchivedGameResult mirrors the archived_game_results table.
type ArchivedGameResult struct {
	ID           int      `json:"id"`
	ArchiveID    int      `json:"archiveId"`
	TeamID       *int     `json:"teamId"`
	Position     int      `json:"position"`
	Score        int      `json:"score"`
	Participants []string `json:"participants"`
}

// ArchiveSession creates an archived game record from a session.
func ArchiveSession(ctx context.Context, session *GameSession) (*ArchivedGame, error) {
	a := &ArchivedGame{}
	var sessionID, gameID sql.NullInt64
	sessionID = sql.NullInt64{Int64: int64(session.ID), Valid: true}
	gameID = sql.NullInt64{Int64: int64(session.GameID), Valid: true}

	err := DB.QueryRowContext(ctx,
		`INSERT INTO archived_games (session_id, game_id, developer_id, developer_name, session_name, started_at, ended_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 ON CONFLICT DO NOTHING
		 RETURNING id, session_id, game_id, developer_id, developer_name, session_name, started_at, ended_at, network_summary, created_at`,
		sessionID, gameID, session.DeveloperID, session.DeveloperName,
		session.GameName, session.StartTime, session.EndTime,
	).Scan(
		&a.ID, &sessionID, &gameID, &a.DeveloperID, &a.DeveloperName,
		&a.SessionName, &a.StartedAt, &a.EndedAt, &a.NetworkSummary, &a.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("archive session: %w", err)
	}
	if sessionID.Valid {
		v := int(sessionID.Int64)
		a.SessionID = &v
	}
	if gameID.Valid {
		v := int(gameID.Int64)
		a.GameID = &v
	}
	return a, nil
}

// ListArchivedGamesForDeveloper returns all archived games for a developer.
func ListArchivedGamesForDeveloper(ctx context.Context, developerID int) ([]ArchivedGame, error) {
	rows, err := DB.QueryContext(ctx,
		`SELECT id, session_id, game_id, developer_id, developer_name, session_name,
		        started_at, ended_at, network_summary, created_at
		 FROM archived_games WHERE developer_id = $1
		 ORDER BY ended_at DESC`, developerID,
	)
	if err != nil {
		return nil, fmt.Errorf("list archived games: %w", err)
	}
	defer rows.Close()

	var archives []ArchivedGame
	for rows.Next() {
		a := ArchivedGame{}
		var sessionID, gameID sql.NullInt64
		err := rows.Scan(
			&a.ID, &sessionID, &gameID, &a.DeveloperID, &a.DeveloperName,
			&a.SessionName, &a.StartedAt, &a.EndedAt, &a.NetworkSummary, &a.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan archive: %w", err)
		}
		if sessionID.Valid {
			v := int(sessionID.Int64)
			a.SessionID = &v
		}
		if gameID.Valid {
			v := int(gameID.Int64)
			a.GameID = &v
		}
		archives = append(archives, a)
	}

	// Load results for each archive
	for i := range archives {
		results, err := listArchiveResults(ctx, archives[i].ID)
		if err != nil {
			return nil, err
		}
		archives[i].Results = results
	}
	return archives, rows.Err()
}

// GetArchivedGameByID fetches a single archived game with results.
func GetArchivedGameByID(ctx context.Context, id int) (*ArchivedGame, error) {
	a := &ArchivedGame{}
	var sessionID, gameID sql.NullInt64
	err := DB.QueryRowContext(ctx,
		`SELECT id, session_id, game_id, developer_id, developer_name, session_name,
		        started_at, ended_at, network_summary, created_at
		 FROM archived_games WHERE id = $1`, id,
	).Scan(
		&a.ID, &sessionID, &gameID, &a.DeveloperID, &a.DeveloperName,
		&a.SessionName, &a.StartedAt, &a.EndedAt, &a.NetworkSummary, &a.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get archived game: %w", err)
	}
	if sessionID.Valid {
		v := int(sessionID.Int64)
		a.SessionID = &v
	}
	if gameID.Valid {
		v := int(gameID.Int64)
		a.GameID = &v
	}
	results, err := listArchiveResults(ctx, id)
	if err != nil {
		return nil, err
	}
	a.Results = results
	return a, nil
}

// DeleteArchivedGame removes an archived game.
func DeleteArchivedGame(ctx context.Context, id int) error {
	_, err := DB.ExecContext(ctx, `DELETE FROM archived_games WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete archived game: %w", err)
	}
	return nil
}

func listArchiveResults(ctx context.Context, archiveID int) ([]ArchivedGameResult, error) {
	rows, err := DB.QueryContext(ctx,
		`SELECT id, archive_id, team_id, position, score, participants
		 FROM archived_game_results WHERE archive_id = $1
		 ORDER BY position`, archiveID,
	)
	if err != nil {
		return nil, fmt.Errorf("list archive results: %w", err)
	}
	defer rows.Close()

	var results []ArchivedGameResult
	for rows.Next() {
		r := ArchivedGameResult{}
		var teamID sql.NullInt64
		if err := rows.Scan(&r.ID, &r.ArchiveID, &teamID, &r.Position, &r.Score, &r.Participants); err != nil {
			return nil, fmt.Errorf("scan result: %w", err)
		}
		if teamID.Valid {
			v := int(teamID.Int64)
			r.TeamID = &v
		}
		results = append(results, r)
	}
	return results, rows.Err()
}
