import { useState, useEffect } from "react";
import axios from "axios"; 

const useTeamHandler = (apiUrl: string) => {
  const [teams, setTeams] = useState<any[]>([]);

  useEffect(() => {
    // Fetch data from the backend
    const fetchTeams = async () => {
      try {
        const response = await axios.get(apiUrl);
        const teamData = response.data;
        setTeams(teamData);
      } catch (error) {
        console.error("Error fetching team data: ", error);
      }
    };

    fetchTeams();
  }, [apiUrl]);

  return teams;
};

export default useTeamHandler;
