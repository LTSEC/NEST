import { useState, useEffect } from "react";
import axios from "axios";

// Define your data models
export interface ServiceData {
  points: number;
  is_up: boolean;
  successful_checks: number;
  total_checks: number;
}

export interface Team {
  ID: number;
  Name: string;
  Color: string;
  Services: Record<string, ServiceData>;
}

// Use the backend URL from environment variables
const API_BASE_URL = import.meta.env.VITE_API_URL;

// Let the hook return an array of `Team`
function useTeamHandler(apiUrl: string): Team[] {
  const [teams, setTeams] = useState<Team[]>([]);

  useEffect(() => {
    const fetchTeams = async () => {
      try {
        // Tell axios what type we expect for `data`
        const { data } = await axios.get<Team[]>(`${API_BASE_URL}${apiUrl}`);
        setTeams(data);
      } catch (error) {
        console.error("Error fetching team data: ", error);
      }
    };

    fetchTeams();
  }, [apiUrl]);

  return teams;
}

export default useTeamHandler;
