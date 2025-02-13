import { useEffect, useState } from "react";
import { MantineProvider } from "@mantine/core";
import useTeamHandler from "../TeamHandler";
import "@mantine/core/styles.css";
import { BarChart } from "@mantine/charts";

const ScoreGraph = () => {
  const teamData = useTeamHandler("/api/teams/scores");
  const [chartData, setChartData] = useState<
    { label: string; value: number; color: string }[]
  >([]);

  useEffect(() => {
    if (!teamData || teamData.length === 0) return;

    // Transform API response to sum up scores
    const formattedTeams = teamData.map((team) => {
    const totalScore = Object.values(team.Services).reduce(
        (sum, score) => (sum as number) + (score as number),
        0
        );

      return {
        label: team.Name, // Use team name as label
        value: (totalScore as number), // Sum of all services' scores
        color: team.Color || "#89CFF0", // Fallback to baby blue if no color is set
      };
    });

    setChartData(formattedTeams);
  }, [teamData]);

  return (
    <MantineProvider>
      <BarChart
        w={600}
        h={400}
        data={chartData}
        dataKey="label"
        series={[{ name: "Score", color: "#3498db" }]}
        title="Score Distribution by Teams"
      />
    </MantineProvider>
  );
};

export default ScoreGraph;
