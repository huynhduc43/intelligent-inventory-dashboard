# Performance evidence

Target (§1.4): the dashboard and a 50-row list page answer in p95 ≤ 300 ms at 2,000 in-stock vehicles. The plans below are at **8× that size**: `SEED_VEHICLES_PER_DEALERSHIP=20000`, which is about 16,000 in-stock vehicles per dealership (60,003 vehicles and about 19,000 actions over the three seeded dealerships). The list page runs in 39 ms and the dashboard request (its three statements) in about 45 ms in total, so both targets hold with a wide margin.

Reproduce (the seed must go into an **empty** database: it adds actions only to a dealership that has none, so seeding 20,000 on top of the default 250 leaves almost no actions):

```sh
docker compose down -v && docker compose up -d postgres
cp apps/api/.env.example apps/api/.env
pnpm --filter @inventory/api db:migrate
SEED_VEHICLES_PER_DEALERSHIP=20000 pnpm --filter @inventory/api db:seed
pnpm --filter @inventory/api db:explain
```

`db:explain` ([`src/explain-queries.ts`](../apps/api/src/explain-queries.ts)) runs `ANALYZE`, then calls the real `VehiclesService.list` and `DashboardService.get` for the London dealership with a logger that records each SQL statement, and replays every recorded `SELECT` as `EXPLAIN (ANALYZE, BUFFERS)` with the same text and parameters. The plans therefore come from the SQL the app really sends and cannot drift from the code. Execution times are from one run on a laptop (PostgreSQL 17.11 in Docker, warm cache, 2026-11-03); yours will differ.

| Case                                        | Plan                                                         | Execution |
| ------------------------------------------- | ------------------------------------------------------------ | --------- |
| List, default (in stock, oldest, limit 50)  | Seq Scan on `vehicle`, latest-action index lookup per row    | 39 ms     |
| List, `tier=AGING`                          | Seq Scan, same shape                                         | 22 ms     |
| List, `make=Ford&model=Focus`               | Index Scan on `vehicle_dealership_make_model_idx`            | 7 ms      |
| List, `tier=AGING&hasAction=false`          | Seq Scan, same shape                                         | 18 ms     |
| Dashboard, KPIs and age buckets             | Bitmap Index Scan on `vehicle_dealership_status_stocked_idx` | 20 ms     |
| Dashboard, make and model                   | Bitmap Index Scan on `vehicle_dealership_status_stocked_idx` | 4 ms      |
| Dashboard, current-action counts            | Bitmap Index Scan, then latest-action index lookup per row   | 21 ms     |
| **Dashboard request, total (3 statements)** |                                                              | **45 ms** |

Reading the plans:

- **List.** The cost is the latest-action lookup (`LEFT JOIN LATERAL … ORDER BY id DESC LIMIT 1`, an index scan on `vehicle_action_vehicle_id_idx` per vehicle) for every matching row before the `LIMIT`, because the total (`count(*) OVER ()`) and the sort sit above the join. It grows linearly with the in-stock count, so it is about 39 ms at 16,000 and a fraction of that at 2,000. The planner picks a Seq Scan of `vehicle` here: that join is estimated at about 10 cost units per row, which swamps the difference between the scan paths, and the seed puts a third of the table in one dealership (at the designed 50 dealerships it would be about 2%). Shown as it comes out, not tuned. Filtering by make and model uses its index (about 4,000 matching in-stock rows for a typical pair, so the same per-row lookup applies: 7 ms).
- **Dashboard.** Three statements in one `REPEATABLE READ` read-only transaction, each a Bitmap Index Scan on `vehicle_dealership_status_stocked_idx` (dealership, status, `stocked_on`), then an aggregate. The "aging with no action" subquery and the current-action counts use the same `vehicle_action_vehicle_id_idx` lookup.
- **JIT.** PostgreSQL's JIT compiler fires on three statements (the list default and two dashboard statements) because the lookup's cost estimate passes `jit_above_cost`; it adds 5 to 10 ms each. Turning it off is a server tuning decision, outside this evidence.

<details>
<summary>Full <code>db:explain</code> output</summary>

```text
$ nest build && node --env-file-if-exists=.env dist/explain-queries.js

Postgres 17.11 (Debian 17.11-1.pgdg13+2), dealership London, today_local 2026-11-03

=== List: default (IN_STOCK, oldest first, limit 50) (statement 1 of 1)
Limit  (cost=170291.17..170291.29 rows=50 width=185) (actual time=38.684..38.691 rows=50 loops=1)
  Buffers: shared hit=36718
  ->  Sort  (cost=170291.17..170331.45 rows=16112 width=185) (actual time=31.498..31.501 rows=50 loops=1)
        Sort Key: v.stocked_on, v.id
        Sort Method: top-N heapsort  Memory: 36kB
        Buffers: shared hit=36718
        ->  WindowAgg  (cost=169382.90..169755.94 rows=16112 width=185) (actual time=22.230..27.365 rows=16020 loops=1)
              Buffers: shared hit=36718
              ->  Nested Loop Left Join  (cost=0.29..169192.02 rows=16112 width=129) (actual time=0.024..18.655 rows=16020 loops=1)
                    Buffers: shared hit=36718
                    ->  Seq Scan on vehicle v  (cost=0.00..2002.04 rows=16112 width=92) (actual time=0.010..6.144 rows=16020 loops=1)
                          Filter: ((status = ANY ('{IN_STOCK}'::text[])) AND (dealership_id = '00000000-0000-4000-8000-0000000000d1'::uuid))
                          Rows Removed by Filter: 43983
                          Buffers: shared hit=1177
                    ->  Limit  (cost=0.29..10.36 rows=1 width=61) (actual time=0.001..0.001 rows=0 loops=16020)
                          Buffers: shared hit=35541
                          ->  Index Scan using vehicle_action_vehicle_id_idx on vehicle_action a  (cost=0.29..10.36 rows=1 width=61) (actual time=0.000..0.000 rows=0 loops=16020)
                                Index Cond: (vehicle_id = v.id)
                                Filter: (dealership_id = v.dealership_id)
                                Buffers: shared hit=35541
Planning Time: 0.160 ms
JIT:
  Functions: 16
  Options: Inlining false, Optimization false, Expressions true, Deforming true
  Timing: Generation 0.506 ms (Deform 0.241 ms), Inlining 0.000 ms, Optimization 0.352 ms, Emission 6.849 ms, Total 7.707 ms
Execution Time: 39.268 ms

=== List: tier=AGING (statement 1 of 1)
Limit  (cost=93451.41..93451.53 rows=50 width=185) (actual time=22.084..22.090 rows=50 loops=1)
  Buffers: shared hit=22182
  ->  Sort  (cost=93451.41..93473.26 rows=8741 width=185) (actual time=22.084..22.087 rows=50 loops=1)
        Sort Key: v.stocked_on, v.id
        Sort Method: top-N heapsort  Memory: 37kB
        Buffers: shared hit=22182
        ->  WindowAgg  (cost=92953.73..93161.04 rows=8741 width=185) (actual time=16.463..19.769 rows=8752 loops=1)
              Buffers: shared hit=22182
              ->  Nested Loop Left Join  (cost=0.29..92855.10 rows=8741 width=129) (actual time=0.011..14.459 rows=8752 loops=1)
                    Buffers: shared hit=22182
                    ->  Seq Scan on vehicle v  (cost=0.00..2152.05 rows=8741 width=92) (actual time=0.005..7.057 rows=8752 loops=1)
                          Filter: ((status = ANY ('{IN_STOCK}'::text[])) AND (stocked_on <= '2026-08-04'::date) AND (dealership_id = '00000000-0000-4000-8000-0000000000d1'::uuid))
                          Rows Removed by Filter: 51251
                          Buffers: shared hit=1177
                    ->  Limit  (cost=0.29..10.36 rows=1 width=61) (actual time=0.001..0.001 rows=0 loops=8752)
                          Buffers: shared hit=21005
                          ->  Index Scan using vehicle_action_vehicle_id_idx on vehicle_action a  (cost=0.29..10.36 rows=1 width=61) (actual time=0.001..0.001 rows=0 loops=8752)
                                Index Cond: (vehicle_id = v.id)
                                Filter: (dealership_id = v.dealership_id)
                                Buffers: shared hit=21005
Planning Time: 0.139 ms
Execution Time: 22.119 ms

=== List: make=Ford&model=Focus (statement 1 of 1)
Limit  (cost=7739.01..7739.14 rows=50 width=185) (actual time=7.064..7.069 rows=50 loops=1)
  Buffers: shared hit=9233
  ->  Sort  (cost=7739.01..7740.61 rows=638 width=185) (actual time=7.063..7.066 rows=50 loops=1)
        Sort Key: v.stocked_on, v.id
        Sort Method: top-N heapsort  Memory: 38kB
        Buffers: shared hit=9233
        ->  WindowAgg  (cost=7691.39..7717.82 rows=638 width=185) (actual time=4.866..6.025 rows=4000 loops=1)
              Buffers: shared hit=9233
              ->  Nested Loop Left Join  (cost=0.58..7695.49 rows=638 width=129) (actual time=0.010..3.956 rows=4000 loops=1)
                    Buffers: shared hit=9233
                    ->  Index Scan using vehicle_dealership_make_model_idx on vehicle v  (cost=0.29..1075.13 rows=638 width=92) (actual time=0.007..0.761 rows=4000 loops=1)
                          Index Cond: ((dealership_id = '00000000-0000-4000-8000-0000000000d1'::uuid) AND (lower(make) = 'ford'::text) AND (lower(model) = 'focus'::text))
                          Filter: (status = ANY ('{IN_STOCK}'::text[]))
                          Buffers: shared hit=398
                    ->  Limit  (cost=0.29..10.36 rows=1 width=61) (actual time=0.001..0.001 rows=0 loops=4000)
                          Buffers: shared hit=8835
                          ->  Index Scan using vehicle_action_vehicle_id_idx on vehicle_action a  (cost=0.29..10.36 rows=1 width=61) (actual time=0.001..0.001 rows=0 loops=4000)
                                Index Cond: (vehicle_id = v.id)
                                Filter: (dealership_id = v.dealership_id)
                                Buffers: shared hit=8835
Planning Time: 0.099 ms
Execution Time: 7.091 ms

=== List: tier=AGING&hasAction=false (statement 1 of 1)
Limit  (cost=92855.15..92855.15 rows=1 width=185) (actual time=17.937..17.942 rows=50 loops=1)
  Buffers: shared hit=22182
  ->  Sort  (cost=92855.15..92855.15 rows=1 width=185) (actual time=17.936..17.939 rows=50 loops=1)
        Sort Key: v.stocked_on, v.id
        Sort Method: top-N heapsort  Memory: 36kB
        Buffers: shared hit=22182
        ->  WindowAgg  (cost=0.29..92855.14 rows=1 width=185) (actual time=15.581..16.603 rows=5251 loops=1)
              Buffers: shared hit=22182
              ->  Nested Loop Left Join  (cost=0.29..92855.10 rows=1 width=129) (actual time=0.007..14.430 rows=5251 loops=1)
                    Filter: (a.action_type IS NULL)
                    Rows Removed by Filter: 3501
                    Buffers: shared hit=22182
                    ->  Seq Scan on vehicle v  (cost=0.00..2152.05 rows=8741 width=92) (actual time=0.004..7.159 rows=8752 loops=1)
                          Filter: ((status = ANY ('{IN_STOCK}'::text[])) AND (stocked_on <= '2026-08-04'::date) AND (dealership_id = '00000000-0000-4000-8000-0000000000d1'::uuid))
                          Rows Removed by Filter: 51251
                          Buffers: shared hit=1177
                    ->  Limit  (cost=0.29..10.36 rows=1 width=61) (actual time=0.001..0.001 rows=0 loops=8752)
                          Buffers: shared hit=21005
                          ->  Index Scan using vehicle_action_vehicle_id_idx on vehicle_action a  (cost=0.29..10.36 rows=1 width=61) (actual time=0.001..0.001 rows=0 loops=8752)
                                Index Cond: (vehicle_id = v.id)
                                Filter: (dealership_id = v.dealership_id)
                                Buffers: shared hit=21005
Planning Time: 0.097 ms
Execution Time: 17.967 ms

=== Dashboard (statement 1 of 3)
Aggregate  (cost=169752.26..169752.30 rows=1 width=44) (actual time=19.629..19.630 rows=1 loops=1)
  Buffers: shared hit=21416
  ->  Bitmap Heap Scan on vehicle v  (cost=257.44..1676.12 rows=16112 width=36) (actual time=0.390..1.665 rows=16020 loops=1)
        Recheck Cond: ((dealership_id = '00000000-0000-4000-8000-0000000000d1'::uuid) AND (status = 'IN_STOCK'::text))
        Heap Blocks: exact=393
        Buffers: shared hit=411
        ->  Bitmap Index Scan on vehicle_dealership_status_stocked_idx  (cost=0.00..253.41 rows=16112 width=0) (actual time=0.361..0.362 rows=16020 loops=1)
              Index Cond: ((dealership_id = '00000000-0000-4000-8000-0000000000d1'::uuid) AND (status = 'IN_STOCK'::text))
              Buffers: shared hit=18
  SubPlan 1
    ->  Index Scan using vehicle_action_vehicle_id_idx on vehicle_action a  (cost=0.29..10.36 rows=1 width=0) (actual time=0.001..0.001 rows=0 loops=8752)
          Index Cond: (vehicle_id = v.id)
          Filter: (dealership_id = v.dealership_id)
          Buffers: shared hit=21005
Planning Time: 0.111 ms
JIT:
  Functions: 15
  Options: Inlining false, Optimization false, Expressions true, Deforming true
  Timing: Generation 0.686 ms (Deform 0.168 ms), Inlining 0.000 ms, Optimization 0.307 ms, Emission 8.091 ms, Total 9.085 ms
Execution Time: 20.360 ms

=== Dashboard (statement 2 of 3)
Sort  (cost=1918.75..1918.82 rows=25 width=18) (actual time=5.002..5.002 rows=5 loops=1)
  Sort Key: ((count(*))::integer) DESC, make, model
  Sort Method: quicksort  Memory: 25kB
  Buffers: shared hit=411
  ->  HashAggregate  (cost=1917.80..1918.17 rows=25 width=18) (actual time=4.993..4.994 rows=5 loops=1)
        Group Key: make, model
        Batches: 1  Memory Usage: 24kB
        Buffers: shared hit=411
        ->  Bitmap Heap Scan on vehicle v  (cost=257.44..1676.12 rows=16112 width=14) (actual time=0.417..1.532 rows=16020 loops=1)
              Recheck Cond: ((dealership_id = '00000000-0000-4000-8000-0000000000d1'::uuid) AND (status = 'IN_STOCK'::text))
              Heap Blocks: exact=393
              Buffers: shared hit=411
              ->  Bitmap Index Scan on vehicle_dealership_status_stocked_idx  (cost=0.00..253.41 rows=16112 width=0) (actual time=0.385..0.385 rows=16020 loops=1)
                    Index Cond: ((dealership_id = '00000000-0000-4000-8000-0000000000d1'::uuid) AND (status = 'IN_STOCK'::text))
                    Buffers: shared hit=18
Planning:
  Buffers: shared hit=4
Planning Time: 0.109 ms
Execution Time: 5.019 ms

=== Dashboard (statement 3 of 3)
GroupAggregate  (cost=169991.99..170112.84 rows=1 width=36) (actual time=18.721..20.266 rows=7 loops=1)
  Group Key: (COALESCE(a.action_type, 'NONE'::text))
  Buffers: shared hit=35952
  ->  Sort  (cost=169991.99..170032.27 rows=16112 width=32) (actual time=18.683..19.255 rows=16020 loops=1)
        Sort Key: (COALESCE(a.action_type, 'NONE'::text))
        Sort Method: quicksort  Memory: 385kB
        Buffers: shared hit=35952
        ->  Nested Loop Left Join  (cost=257.73..168866.10 rows=16112 width=32) (actual time=4.254..17.611 rows=16020 loops=1)
              Buffers: shared hit=35952
              ->  Bitmap Heap Scan on vehicle v  (cost=257.44..1676.12 rows=16112 width=32) (actual time=0.340..1.501 rows=16020 loops=1)
                    Recheck Cond: ((dealership_id = '00000000-0000-4000-8000-0000000000d1'::uuid) AND (status = 'IN_STOCK'::text))
                    Heap Blocks: exact=393
                    Buffers: shared hit=411
                    ->  Bitmap Index Scan on vehicle_dealership_status_stocked_idx  (cost=0.00..253.41 rows=16112 width=0) (actual time=0.314..0.315 rows=16020 loops=1)
                          Index Cond: ((dealership_id = '00000000-0000-4000-8000-0000000000d1'::uuid) AND (status = 'IN_STOCK'::text))
                          Buffers: shared hit=18
              ->  Limit  (cost=0.29..10.36 rows=1 width=18) (actual time=0.001..0.001 rows=0 loops=16020)
                    Buffers: shared hit=35541
                    ->  Index Scan using vehicle_action_vehicle_id_idx on vehicle_action a  (cost=0.29..10.36 rows=1 width=18) (actual time=0.000..0.000 rows=0 loops=16020)
                          Index Cond: (vehicle_id = v.id)
                          Filter: (dealership_id = v.dealership_id)
                          Buffers: shared hit=35541
Planning Time: 0.090 ms
JIT:
  Functions: 15
  Options: Inlining false, Optimization false, Expressions true, Deforming true
  Timing: Generation 0.371 ms (Deform 0.133 ms), Inlining 0.000 ms, Optimization 0.215 ms, Emission 3.698 ms, Total 4.284 ms
Execution Time: 20.684 ms
```

</details>
