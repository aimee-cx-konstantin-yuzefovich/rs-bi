import { bitrixPost } from "./src/lib/bitrix";
import { config } from "dotenv";
config();

async function test() {
  try {
    const data = await bitrixPost("user.get", { start: 0 });
    console.log(JSON.stringify(data).substring(0, 500));
  } catch (e) {
    console.error(e);
  }
}
test();
