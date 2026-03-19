# Mini 2D Resource Game

Simple browser game demonstrating villagers that gather resources and deposit into storage.

How to run

1. Install dependencies and run the dev server:

```bash
npm install
npm start
```

Then open http://localhost:3000

Controls

- Click the `Add Villager` button to spawn a new worker at storage.
- Select a villager from the right panel. Click a colored resource tile on the map to queue a gather task.
- Villagers have a carry limit and will return to storage to deposit automatically.

Notes

- Resources are represented by colored squares (tree, stone, iron, copper, gold).
- Tasks are queued per villager and executed in FIFO order.
