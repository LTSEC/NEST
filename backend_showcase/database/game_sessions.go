package database

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// GameSession mirrors the game_sessions table.
type GameSession struct {
	ID                   int       `json:"id"`
	GameID               int       `json:"gameId"`
	DeveloperID          int       `json:"developerId"`
	GameName             string    `json:"gameName"`
	DeveloperName        string    `json:"developerName"`
	Types                []string  `json:"types"`
	StartTime            time.Time `json:"startTime"`
	EndTime              time.Time `json:"endTime"`
	Visibility           string    `json:"visibility"`
	MinPlayers           int       `json:"minPlayers"`
	Status               string    `json:"status"`
	InfrastructureID     *int      `json:"infrastructureId"`
	InfrastructureStatus *string   `json:"infrastructureStatus"`
	CreatedAt            time.Time `json:"createdAt"`
	UpdatedAt            time.Time `json:"updatedAt"`
}

// CreateGameSession inserts a new session.
func CreateGameSession(ctx context.Context, s *GameSession) error {
	var infraID sql.NullInt64
	var infraStatus sql.NullString
	if s.InfrastructureID != nil {
		infraID = sql.NullInt64{Int64: int64(*s.InfrastructureID), Valid: true}
	}
	if s.InfrastructureStatus != nil {
		infraStatus = sql.NullString{String: *s.InfrastructureStatus, Valid: true}
	}
	err := DB.QueryRowContext(ctx,
		`INSERT INTO game_sessions
		 (game_id, developer_id, game_name, developer_name, types,
		  start_time, end_time, visibility, min_players, status,
		  infrastructure_id, infrastructure_status)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		 RETURNING id, created_at, updated_at`,
		s.GameID, s.DeveloperID, s.GameName, s.DeveloperName, s.Types,
		s.StartTime, s.EndTime, s.Visibility, s.MinPlayers, s.Status,
		infraID, infraStatus,
	).Scan(&s.ID, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		return fmt.Errorf("create game session: %w", err)
	}
	return nil
}

// GetSessionByID fetches a single session.
func GetSessionByID(ctx context.Context, id int) (*GameSession, error) {
	s := &GameSession{}
	var infraID sql.NullInt64
	var infraStatus sql.NullString
	err := DB.QueryRowContext(ctx,
		`SELECT id, game_id, developer_id, game_name, developer_name, types,
		        start_time, end_time, visibility, min_players, status,
		        infrastructure_id, infrastructure_status, created_at, updated_at
		 FROM game_sessions WHERE id = $1`, id,
	).Scan(
		&s.ID, &s.GameID, &s.DeveloperID, &s.GameName, &s.DeveloperName, &s.Types,
		&s.StartTime, &s.EndTime, &s.Visibility, &s.MinPlayers, &s.Status,
		&infraID, &infraStatus, &s.CreatedAt, &s.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get session: %w", err)
	}
	if infraID.Valid {
		v := int(infraID.Int64)
		s.InfrastructureID = &v
	}
	if infraStatus.Valid {
		s.InfrastructureStatus = &infraStatus.String
	}
	return s, nil
}

// ListSessionsForDeveloper returns all sessions owned by a developer.
func ListSessionsForDeveloper(ctx context.Context, developerID int) ([]GameSession, error) {
	rows, err := DB.QueryContext(ctx,
		`SELECT id, game_id, developer_id, game_name, developer_name, types,
		        start_time, end_time, visibility, min_players, status,
		        infrastructure_id, infrastructure_status, created_at, updated_at
		 FROM game_sessions WHERE developer_id = $1
		 ORDER BY start_time ASC`, developerID,
	)
	if err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	defer rows.Close()
	return scanSessions(rows)
}

// ListSessionsForGame returns all sessions for a given game.
func ListSessionsForGame(ctx context.Context, gameID int) ([]GameSession, error) {
	rows, err := DB.QueryContext(ctx,
		`SELECT id, game_id, developer_id, game_name, developer_name, types,
		        start_time, end_time, visibility, min_players, status,
		        infrastructure_id, infrastructure_status, created_at, updated_at
		 FROM game_sessions WHERE game_id = $1
		 ORDER BY start_time ASC`, gameID,
	)
	if err != nil {
		return nil, fmt.Errorf("list sessions for game: %w", err)
	}
	defer rows.Close()
	return scanSessions(rows)
}

// ListActiveSessions returns non-completed sessions.
func ListActiveSessions(ctx context.Context) ([]GameSession, error) {
	rows, err := DB.QueryContext(ctx,
		`SELECT id, game_id, developer_id, game_name, developer_name, types,
		        start_time, end_time, visibility, min_players, status,
		        infrastructure_id, infrastructure_status, created_at, updated_at
		 FROM game_sessions WHERE status != 'completed'
		 ORDER BY start_time ASC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list active sessions: %w", err)
	}
	defer rows.Close()
	return scanSessions(rows)
}

// UpdateSessionStatus updates the status of a session.
func UpdateSessionStatus(ctx context.Context, id int, status string) error {
	_, err := DB.ExecContext(ctx,
		`UPDATE game_sessions SET status = $1, updated_at = NOW() WHERE id = $2`,
		status, id,
	)
	if err != nil {
		return fmt.Errorf("update session status: %w", err)
	}
	return nil
}

// UpdateInfrastructureStatus updates the infrastructure fields on a session.
func UpdateInfrastructureStatus(ctx context.Context, id int, infraID *int, infraStatus *string) error {
	var iID sql.NullInt64
	var iStatus sql.NullString
	if infraID != nil {
		iID = sql.NullInt64{Int64: int64(*infraID), Valid: true}
	}
	if infraStatus != nil {
		iStatus = sql.NullString{String: *infraStatus, Valid: true}
	}
	_, err := DB.ExecContext(ctx,
		`UPDATE game_sessions SET infrastructure_id = $1, infrastructure_status = $2, updated_at = NOW()
		 WHERE id = $3`,
		iID, iStatus, id,
	)
	if err != nil {
		return fmt.Errorf("update infrastructure status: %w", err)
	}
	return nil
}

// DeleteSession removes a session by ID.
func DeleteSession(ctx context.Context, id int) error {
	_, err := DB.ExecContext(ctx, `DELETE FROM game_sessions WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}

func scanSessions(rows *sql.Rows) ([]GameSession, error) {
	var sessions []GameSession
	for rows.Next() {
		s := GameSession{}
		var infraID sql.NullInt64
		var infraStatus sql.NullString
		err := rows.Scan(
			&s.ID, &s.GameID, &s.DeveloperID, &s.GameName, &s.DeveloperName, &s.Types,
			&s.StartTime, &s.EndTime, &s.Visibility, &s.MinPlayers, &s.Status,
			&infraID, &infraStatus, &s.CreatedAt, &s.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan session: %w", err)
		}
		if infraID.Valid {
			v := int(infraID.Int64)
			s.InfrastructureID = &v
		}
		if infraStatus.Valid {
			s.InfrastructureStatus = &infraStatus.String
		}
		sessions = append(sessions, s)
	}
	return sessions, rows.Err()
}
