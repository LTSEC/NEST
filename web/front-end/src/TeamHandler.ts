import { useState, useEffect } from "react";
import axios from "axios";

// Use the backend URL from environment variables
const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8080"; // Fallback for local dev

const useTeamHandler = (apiUrl: string) => {
  const [teams, setTeams] = useState<any[]>([]);

  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}${apiUrl}`);
        setTeams(response.data);
      } catch (error) {
        console.error("Error fetching team data: ", error);
      }
    };

    fetchTeams();
  }, [apiUrl]);

  return teams;
};

export default useTeamHandler;