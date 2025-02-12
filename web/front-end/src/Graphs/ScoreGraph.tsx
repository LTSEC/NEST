import { useEffect, useState } from "react";
import useTeamHandler from "../TeamHandler";
import { MantineProvider } from "@mantine/core";
import '@mantine/core/styles.css';
import { BarChart } from '@mantine/charts';

// testing data
const data = [
    {name: "team1", score: 1000, color: "#89CFF0"},
    {name: "team2", score: 375, color: "#89CFF0"},
    {name: "team3", score: 2852, color: "#89CFF0"},
    {name: "team4", score: 4386, color: "#89CFF0"},

]

interface Team {
    name: string;
    score: number;
    color: string;
  }

const ScoreGraph = () => {
    //const teamData = useTeamHandler("/api/getallteamdata");

    const teamData = data;
    const [chartData, setChartData] = useState<{label: string; value: number; color: string }[]>([]);

    useEffect(() => {
        const formattedTeams = teamData.map((team) => ({
            label: team.name,
            value: team.score,
            color: team.color || "#89CFF0" // sets team color or baby blue as a backup (if team color doesn't exist)
        }));
        setChartData(formattedTeams);
    }, [teamData]);
    
    return (
    <MantineProvider>
        <BarChart
        w={600}
        h={400}
        data={chartData}
        dataKey="label"
        series={[
            {name: "value", color: "#3498db"}
        ]}
        title="Score Distribution by Teams"
        />
      </MantineProvider>
  );
}

export default ScoreGraph;