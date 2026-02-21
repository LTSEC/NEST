package database

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// Team mirrors the teams table.
type Team struct {
	ID         int          `json:"id"`
	Name       string       `json:"name"`
	MinPlayers int          `json:"minPlayers"`
	Members    []TeamMember `json:"members"`
	CreatedAt  time.Time    `json:"createdAt"`
}

// TeamMember mirrors the team_members table.
type TeamMember struct {
	ID       int       `json:"id"`
	TeamID   int       `json:"teamId"`
	UserID   int       `json:"userId"`
	Name     string    `json:"name"`
	Role     string    `json:"role"`
	JoinedAt time.Time `json:"joinedAt"`
}

// TeamInvitation mirrors the team_invitations table.
type TeamInvitation struct {
	ID        int       `json:"id"`
	TeamID    int       `json:"teamId"`
	UserID    int       `json:"userId"`
	InvitedBy int       `json:"invitedBy"`
	CreatedAt time.Time `json:"createdAt"`
}

// ListTeams returns all teams with their members.
func ListTeams(ctx context.Context) ([]Team, error) {
	rows, err := DB.QueryContext(ctx,
		`SELECT id, name, min_players, created_at FROM teams ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("list teams: %w", err)
	}
	defer rows.Close()

	var teams []Team
	for rows.Next() {
		t := Team{}
		if err := rows.Scan(&t.ID, &t.Name, &t.MinPlayers, &t.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan team: %w", err)
		}
		teams = append(teams, t)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Batch-load members
	for i := range teams {
		members, err := listTeamMembers(ctx, teams[i].ID)
		if err != nil {
			return nil, err
		}
		teams[i].Members = members
	}
	return teams, nil
}

// GetTeamByID fetches a team with members.
func GetTeamByID(ctx context.Context, id int) (*Team, error) {
	t := &Team{}
	err := DB.QueryRowContext(ctx,
		`SELECT id, name, min_players, created_at FROM teams WHERE id = $1`, id,
	).Scan(&t.ID, &t.Name, &t.MinPlayers, &t.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get team: %w", err)
	}
	members, err := listTeamMembers(ctx, id)
	if err != nil {
		return nil, err
	}
	t.Members = members
	return t, nil
}

// GetTeamForUser finds the team a user belongs to.
func GetTeamForUser(ctx context.Context, userID int) (*Team, error) {
	var teamID int
	err := DB.QueryRowContext(ctx,
		`SELECT team_id FROM team_members WHERE user_id = $1 LIMIT 1`, userID,
	).Scan(&teamID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get team for user: %w", err)
	}
	return GetTeamByID(ctx, teamID)
}

// CreateTeam creates a new team with the creator as captain.
func CreateTeam(ctx context.Context, name string, creatorID int, creatorName string) (*Team, error) {
	tx, err := DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	t := &Team{}
	err = tx.QueryRowContext(ctx,
		`INSERT INTO teams (name) VALUES ($1) RETURNING id, name, min_players, created_at`,
		name,
	).Scan(&t.ID, &t.Name, &t.MinPlayers, &t.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("insert team: %w", err)
	}

	_, err = tx.ExecContext(ctx,
		`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'captain')`,
		t.ID, creatorID,
	)
	if err != nil {
		return nil, fmt.Errorf("insert captain: %w", err)
	}

	// Remove pending invitations for this user
	_, _ = tx.ExecContext(ctx,
		`DELETE FROM team_invitations WHERE user_id = $1`, creatorID)

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	t.Members = []TeamMember{{
		TeamID: t.ID,
		UserID: creatorID,
		Name:   creatorName,
		Role:   "captain",
	}}
	return t, nil
}

// AddTeamMember adds a user to a team.
func AddTeamMember(ctx context.Context, teamID, userID int, role string) error {
	_, err := DB.ExecContext(ctx,
		`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)
		 ON CONFLICT (team_id, user_id) DO NOTHING`,
		teamID, userID, role,
	)
	if err != nil {
		return fmt.Errorf("add team member: %w", err)
	}
	return nil
}

// RemoveTeamMember removes a user from a team.
func RemoveTeamMember(ctx context.Context, teamID, userID int) error {
	_, err := DB.ExecContext(ctx,
		`DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`,
		teamID, userID,
	)
	if err != nil {
		return fmt.Errorf("remove team member: %w", err)
	}
	return nil
}

// UpdateMemberRole changes a team member's role.
func UpdateMemberRole(ctx context.Context, teamID, userID int, role string) error {
	_, err := DB.ExecContext(ctx,
		`UPDATE team_members SET role = $1 WHERE team_id = $2 AND user_id = $3`,
		role, teamID, userID,
	)
	if err != nil {
		return fmt.Errorf("update member role: %w", err)
	}
	return nil
}

// RenameTeam updates a team's display name.
func RenameTeam(ctx context.Context, teamID int, name string) error {
	_, err := DB.ExecContext(ctx,
		`UPDATE teams SET name = $1 WHERE id = $2`, name, teamID)
	if err != nil {
		return fmt.Errorf("rename team: %w", err)
	}
	return nil
}

// CreateInvitation creates a team invitation.
func CreateInvitation(ctx context.Context, teamID, userID, invitedBy int) (*TeamInvitation, error) {
	inv := &TeamInvitation{}
	err := DB.QueryRowContext(ctx,
		`INSERT INTO team_invitations (team_id, user_id, invited_by)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (team_id, user_id) DO UPDATE SET invited_by = $3
		 RETURNING id, team_id, user_id, invited_by, created_at`,
		teamID, userID, invitedBy,
	).Scan(&inv.ID, &inv.TeamID, &inv.UserID, &inv.InvitedBy, &inv.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create invitation: %w", err)
	}
	return inv, nil
}

// ListInvitationsForUser returns pending invitations for a user.
func ListInvitationsForUser(ctx context.Context, userID int) ([]TeamInvitation, error) {
	rows, err := DB.QueryContext(ctx,
		`SELECT id, team_id, user_id, invited_by, created_at
		 FROM team_invitations WHERE user_id = $1`, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("list invitations: %w", err)
	}
	defer rows.Close()

	var invitations []TeamInvitation
	for rows.Next() {
		inv := TeamInvitation{}
		if err := rows.Scan(&inv.ID, &inv.TeamID, &inv.UserID, &inv.InvitedBy, &inv.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan invitation: %w", err)
		}
		invitations = append(invitations, inv)
	}
	return invitations, rows.Err()
}

// AcceptInvitation adds the user to the team and removes the invitation.
func AcceptInvitation(ctx context.Context, invitationID, userID int) (*Team, error) {
	var teamID int
	err := DB.QueryRowContext(ctx,
		`DELETE FROM team_invitations WHERE id = $1 AND user_id = $2 RETURNING team_id`,
		invitationID, userID,
	).Scan(&teamID)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("invitation not found")
	}
	if err != nil {
		return nil, fmt.Errorf("accept invitation: %w", err)
	}

	if err := AddTeamMember(ctx, teamID, userID, "player"); err != nil {
		return nil, err
	}

	return GetTeamByID(ctx, teamID)
}

// DeclineInvitation removes an invitation.
func DeclineInvitation(ctx context.Context, invitationID, userID int) error {
	_, err := DB.ExecContext(ctx,
		`DELETE FROM team_invitations WHERE id = $1 AND user_id = $2`,
		invitationID, userID,
	)
	if err != nil {
		return fmt.Errorf("decline invitation: %w", err)
	}
	return nil
}

func listTeamMembers(ctx context.Context, teamID int) ([]TeamMember, error) {
	rows, err := DB.QueryContext(ctx,
		`SELECT tm.id, tm.team_id, tm.user_id, u.username, tm.role, tm.joined_at
		 FROM team_members tm
		 JOIN users u ON u.id = tm.user_id
		 WHERE tm.team_id = $1
		 ORDER BY tm.joined_at`, teamID,
	)
	if err != nil {
		return nil, fmt.Errorf("list team members: %w", err)
	}
	defer rows.Close()

	var members []TeamMember
	for rows.Next() {
		m := TeamMember{}
		if err := rows.Scan(&m.ID, &m.TeamID, &m.UserID, &m.Name, &m.Role, &m.JoinedAt); err != nil {
			return nil, fmt.Errorf("scan member: %w", err)
		}
		members = append(members, m)
	}
	return members, rows.Err()
}
