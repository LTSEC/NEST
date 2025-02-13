import ScoreGraph from "./Graphs/ScoreGraph";
import ServiceStatus from "./Graphs/ServiceStatus";
import './showGraphs.css'

const ShowGraphs = () => {

    return(
        <>
            <div className="score"><ScoreGraph /></div>
            <div className="status"><ServiceStatus /></div>
            
        </>
    );
}

export default ShowGraphs;