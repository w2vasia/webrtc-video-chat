import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";
import { Show } from "solid-js";
import { useAuth } from "./store/auth";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Chat from "./pages/Chat";
import "./styles/global.css";

function AuthGate() {
  const { isLoggedIn } = useAuth();
  return (
    <Show when={isLoggedIn()} fallback={<Login />}>
      <Chat />
    </Show>
  );
}

render(
  () => (
    <Router>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/" component={AuthGate} />
    </Router>
  ),
  document.getElementById("root")!,
);
