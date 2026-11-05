import {createOrderApp} from './app.mjs';
import {createQ4Review} from './q4-review.mjs';

const app=createOrderApp();
const review=createQ4Review({bridge:app.regularBridge});
app.connectQ4(review);
await app.boot();
