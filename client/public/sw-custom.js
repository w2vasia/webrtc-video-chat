self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const friendId = event.notification.data?.friendId;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        client.postMessage({ type: "open-chat", friendId });
        return client.focus();
      }
      return self.clients.openWindow("/");
    })
  );
});
