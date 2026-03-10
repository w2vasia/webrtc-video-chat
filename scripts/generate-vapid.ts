import webpush from "web-push";

const vapid = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${vapid.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapid.privateKey}`);
