import ScoreGraph from "./Graphs/ScoreGraph";
import ServiceStatus from "./Graphs/ServiceStatus";
import './showGraphs.css'

const ShowGraphs = () => {

    return(
        <>
            <div className="container"><ScoreGraph /></div>
            <div className="container"><ServiceStatus /></div>
            
        </>
    );
}

export default ShowGraphs;