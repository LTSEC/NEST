import React from "react";
import { Card } from "@mantine/core";
import useTeamHandler, { Team } from "../TeamHandler";

const ServiceStatus = () => {
  // Retrieve team data using the TeamHandler hook
  const teamData = useTeamHandler("/teams/scores");

  // Derive the list of service names from the first team, if available.
  // (Assumes all teams share the same services.)
  const services: string[] =
    teamData.length > 0 ? Object.keys(teamData[0].Services) : [];

  return (
    <Card
      padding="sm"
      style={{ display: "flex", justifyContent: "left", padding: 20 }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `auto repeat(${services.length}, 175px)`,
          gap: "2.5px",
          marginTop: "10px",
        }}
      >
        {/* Top-left corner empty cell */}
        <div></div>

        {/* Render service headers */}
        {services.map((service) => (
          <div
            key={service}
            style={{
              width: "125px",
              textAlign: "center",
              fontWeight: "bold",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {service}
          </div>
        ))}

        {/* Loop through each team */}
        {teamData.map((team: Team) => (
          <React.Fragment key={team.ID}>
            {/* Team name in the first column */}
            <div
              key={`label-${team.ID}`}
              style={{
                fontWeight: "bold",
                display: "flex",
                alignItems: "center",
                justifyContent: "right",
                paddingRight: "15px",
              }}
            >
              {team.Name}
            </div>

            {/* Render a status box for each service */}
            {services.map((service, index) => (
              <div
                key={`status-${team.ID}-${index}`}
                style={{
                  width: "125px",
                  height: "20px",
                  backgroundColor: team.Services[service]?.is_up
                    ? "#4CAF50"
                    : "#F44336",
                  borderRadius: "3px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
    </Card>
  );
};

export default ServiceStatus;
