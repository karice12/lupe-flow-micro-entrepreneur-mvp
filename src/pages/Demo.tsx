import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDemo } from "@/contexts/DemoContext";
import { useGoals } from "@/contexts/GoalsContext";

const DEMO_USER_ID = "demo-user";
const DEMO_GOALS = { salary: 6000, bills: 4000, emergency: 10000 };

const Demo = () => {
  const navigate = useNavigate();
  const { activateDemo } = useDemo();
  const { setUserId, setGoals } = useGoals();

  useEffect(() => {
    activateDemo();
    setUserId(DEMO_USER_ID);
    setGoals(DEMO_GOALS);
    navigate("/dashboard", { replace: true });
  }, [activateDemo, setUserId, setGoals, navigate]);

  return null;
};

export default Demo;
