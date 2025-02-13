import React from "react";
import { Card } from "@mantine/core";

// List of services to be displayed in the table header
const services = ["Service A", "Service B", "Service C", "Service D", "Service E", "Service F", "Service G"];

// Sample team data with service statuses (1 = active, 0 = inactive)
type Team = {
    name: string;
    [key: string]: number | string;
};

const teamData: Team[] = [
    { name: "team1", serviceA: 1, serviceB: 0, serviceC: 1, serviceD: 0, serviceE: 0, serviceF: 1, serviceG: 0 },
    { name: "team2", serviceA: 0, serviceB: 0, serviceC: 0, serviceD: 0, serviceE: 0, serviceF: 1, serviceG: 0 },
    { name: "team3", serviceA: 1, serviceB: 1, serviceC: 1, serviceD: 1, serviceE: 0, serviceF: 1, serviceG: 0 },
    { name: "team4", serviceA: 1, serviceB: 0, serviceC: 1, serviceD: 0, serviceE: 0, serviceF: 1, serviceG: 0 }
];




const ServiceStatus = () => {
  return (
    // Outer container card for styling
    <Card padding="sm" style={{ display: "flex", justifyContent: "left", padding: 20 }}>
      <div 
        style={{ 
          display: "grid", 
          gridTemplateColumns: `auto repeat(${services.length}, 175px)`,  // First column auto-sized for team names, remaining columns fixed width
          gap: "2.5px", // Small gap between grid items
          marginTop: "10px" 
        }}
      >
        
        {/* Empty space for top-left corner (aligns with team names) */}
        <div></div>
        
        {/* Service Headers - Displays service names as column titles */}
        {services.map((service) => (
          <div 
            key={service} 
            style={{ 
              width: "125px", 
              textAlign: "center", 
              fontWeight: "bold",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            {service}
          </div>
        ))}
        
        {/* Loop through each team and render its name and service status */}
        {teamData.map((team) => [
          // Team name displayed in the first column
          <div 
            key={`label-${team.name}`} 
            style={{ 
              fontWeight: "bold", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "right", 
              paddingRight: "15px" 
            }}
          >
            {team.name}
          </div>,

          // Status boxes for each service
          ...services.map((service, index) => (
            <div 
              key={`status-${team.name}-${index}`} 
              style={{ 
                width: "125px", 
                height: "20px", 
                backgroundColor: team[`service${service.split(" ")[1]}`] ? "#4CAF50" : "#F44336",  // Green if active, red if inactive
                borderRadius: "3px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            ></div>
          ))
        ])}
      </div>
    </Card>
  );
};

export default ServiceStatus;
