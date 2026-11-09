# worker

Processo dos jobs BullMQ (`ical.sync`, `pricing.recompute`, `insights.monthly` e os jobs das integrações).
É o mesmo código da API (`apps/api/src/worker.ts`) com outro entrypoint: sobe um contexto Nest sem HTTP,
inicia um `Worker` BullMQ por fila registrada, agenda os jobs recorrentes e envia falhas definitivas para a
fila `dead-letter`.

```bash
pnpm --filter api build        # compila apps/api (inclui dist/worker.js)
pnpm --filter worker start     # = pnpm --filter api start:worker (requer Redis e JOBS_ENABLED=true)
pnpm --filter worker start:dev # desenvolvimento via ts-node
```
