import * as cron from 'node-cron';

export interface Scheduler {
  /** (Re)starts the daily job. Throws if the cron expression is invalid. */
  start(expression: string): void;
  stop(): void;
}

export function createScheduler(job: () => Promise<unknown>, timezone: string): Scheduler {
  let task: cron.ScheduledTask | null = null;

  const stop = () => {
    task?.stop();
    task = null;
  };

  return {
    start(expression) {
      if (!cron.validate(expression)) throw new Error(`Invalid cron expression: ${expression}`);
      stop();
      task = cron.schedule(
        expression,
        () => {
          job().catch((e) => console.error('[scheduler] scheduled check failed:', e));
        },
        { timezone },
      );
    },
    stop,
  };
}
