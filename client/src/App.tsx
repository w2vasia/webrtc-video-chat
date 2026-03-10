import { Route } from "@solidjs/router";
import { Show } from "solid-js";
import { useAuth } from "./store/auth";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Chat from "./pages/Chat";

export default function App() {
  const { isLoggedIn } = useAuth();

  return (
    <>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/" component={() => (
        <Show when={isLoggedIn()} fallback={<Login />}>
          <Chat />
        </Show>
      )} />
    </>
  );
}
