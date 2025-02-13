import { useEffect, useState } from "react";
import { MantineProvider } from "@mantine/core";
import useTeamHandler from "../TeamHandler";
import "@mantine/core/styles.css";
import { BarChart } from "@mantine/charts";

const ScoreGraph = () => {
  // Now `teamData` is a Team[]
  const teamData = useTeamHandler("/teams/scores");

  // Each bar in the chart has label, value, and color
  const [chartData, setChartData] = useState<
    { label: string; value: number; color: string }[]
  >([]);

  useEffect(() => {
    if (teamData.length === 0) return;

    // Transform API response to sum up scores
    const formattedTeams = teamData.map((team) => {
      // `Object.values(team.Services)` is now `ServiceData[]`
      const totalScore = Object.values(team.Services).reduce((sum, service) => {
        return sum + service.points;
      }, 0);

      return {
        label: team.Name,
        value: totalScore + 10,
        color: team.Color || "#89CFF0",
      };
    });

    // Sort descending if multiple teams
    if (formattedTeams.length > 1) {
      formattedTeams.sort((a, b) => b.value - a.value);
    }

    setChartData(formattedTeams);
  }, [teamData]);

  return (
    <MantineProvider>
      <BarChart
        w={600}
        h={400}
        withTooltip={false}
        withBarValueLabel={true}
        valueLabelProps={{ fill: "black", fontSize: 12 }}
        orientation="vertical"
        gridAxis="none"
        maxBarWidth={7}
        data={chartData}
        dataKey="label"
        series={[{ name: "value", color: "color" }]}
        title="Score Distribution by Teams"
      />
    </MantineProvider>
  );
};

export default ScoreGraph;
