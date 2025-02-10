import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import Login from "./Login";
import ScoreGraph from "./Graphs/ScoreGraph";

function App() {
  return (
    <MantineProvider>
        <Router>
            <Routes>
                <Route path="/" element={<Login />} />
                <Route path="/graphs" element={<ScoreGraph />} />
            </Routes>
        </Router>
    </MantineProvider>
    
  );
}

export default App;
