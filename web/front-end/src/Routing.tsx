import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import Login from "./Login";
import ShowGraphs from "./ShowGraphs";

function Routing() {
  return (
    <MantineProvider>
        <Router>
            <Routes>
                <Route path="/" element={<Login />} />
                <Route path="/graphs" element={<ShowGraphs />} />
            </Routes>
        </Router>
    </MantineProvider>
    
  );
}

export default Routing;
