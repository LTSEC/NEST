import React from "react";
import { Card } from "@mantine/core";
import useTeamHandler, { Team } from "../TeamHandler";

// Calculates the uptime percentage
const getUptime = (timeScored: number = 0, totalTime: number = 1) => {
    return Math.round((timeScored / totalTime) * 100);
};

// Determines the box color based on uptime percentage
const getBoxColor = (uptime: number) => {
    if (uptime <= 20) return "#831911"; // Dark Red
    if (uptime <= 50) return "#F44336"; // Red
    if (uptime < 75) return "#F08928"; // Orange
    return "#4CAF50"; // Green
};

const ServiceUptime = () => {
    // Retrieve team data
    const teamData = useTeamHandler("/teams/scores");

    // Derive service names (assuming all teams share the same services)
    const services: string[] = teamData.length > 0 ? Object.keys(teamData[0].Services) : [];

    return (
        <Card
            padding="sm"
            style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                padding: 20,
                backgroundColor: "transparent",
                width: "100%",
            }}
        >
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: `auto repeat(${services.length}, 175px)`,
                    gap: "2.5px",
                    marginTop: "10px",
                    justifyContent: "center",
                    alignItems: "center",
                }}
            >
                {/* Empty cell in top-left corner */}
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
                            color: "white",
                        }}
                    >
                        {service.split("_")[1]?.toUpperCase()}
                    </div>
                ))}

                {/* Render team uptime data */}
                {teamData.map((team: Team) => (
                    <React.Fragment key={team.ID}>
                        {/* Team name column */}
                        <div
                            style={{
                                fontWeight: "bold",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "right",
                                paddingRight: "15px",
                                color: "white",
                            }}
                        >
                            {team.Name}
                        </div>

                        {/* Render uptime status boxes */}
                        {services.map((service, index) => {
                            const successfulChecks = team.Services[service]?.successful_checks ?? 0;
                            const totalChecks = team.Services[service]?.total_checks ?? 1; // Prevent division by zero
                            const uptime = getUptime(successfulChecks, totalChecks);
                            const backgroundColor = getBoxColor(uptime);

                            return (
                                <div
                                    key={`status-${team.ID}-${index}`}
                                    style={{
                                        width: "125px",
                                        height: "20px",
                                        backgroundColor,
                                        borderRadius: "3px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                    }}
                                >
                                    {`${uptime}%`}
                                </div>
                            );
                        })}
                    </React.Fragment>
                ))}
            </div>
        </Card>
    );
};

export default ServiceUptime;
