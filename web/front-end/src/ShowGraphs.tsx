import ScoreGraph from "./Graphs/ScoreGraph";
import ServiceStatus from "./Graphs/ServiceStatus";
import ServiceUptime from "./Graphs/ServiceUptime";
import './showGraphs.css'

const ShowGraphs = () => {

    return(
        <>
            <div className="container"><ScoreGraph /></div>
            <div className="container"><ServiceStatus /></div>
            <div className="container"><ServiceUptime /></div>            
        </>
    );
}

export default ShowGraphs;