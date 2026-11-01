# /deliver Finish: PR #17 / issue #6

- **Issue:** https://github.com/huynhduc43/intelligent-inventory-dashboard/issues/6 (Skeleton: validated config, Drizzle migrations, DB readiness, Docker Compose)
- **PR:** https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/17 (đã merge ngày 2026-11-01)
- **Chế độ:** `grill=auto`, `approve=auto`

## Số vòng

**1 vòng** sửa của Implementer (theo định nghĩa round của skill), xong ở commit `92c22c6`. Reviewer chạy 2 lượt: r1 có 3 finding, r2 thì cả hai đều `clean`.

## Kết quả Tester

**pass** (r2): cả 6 tiêu chí chạy trên `docker compose up`. Có 2 tiêu chí ghi "pass (via test)" (`statement_timeout`, `Clock`), vì API đang chạy không cho thấy được hai thứ này nên Tester dẫn integration test làm bằng chứng.

## Comment của reviewer

Cả 3 finding đều là r1, đã sửa trong `92c22c6`, và sang r2 không còn cái nào mở:

1. `[code-review r1]` minor, `apps/api/src/shared/schema.ts:105`: `$onUpdate(() => sql\`now()\`)` lấy `now` ngay trong SQL, không đi qua `Clock` được inject. Đã sửa: bỏ `$onUpdate`, mỗi lần service update thì tự set `updatedAt: clock.now()`. Issue #6 có thêm comment `Amended:`.
2. `[business-review r1]` Spec minor: PK của `user_dealership` mang tên mặc định của Drizzle chứ không phải `user_dealership_pkey`, lại được ghi là "implementation note" dưới mục "Deviations: None". Đã sửa: đặt tên PK đúng, thêm test kiểm tra mọi PK đều tên `<table>_pkey`.
3. `[business-review r1]` Standards minor: `vitest.config.ts` loại `schema.ts` khỏi coverage nhưng `CONTRIBUTING.md` không ghi điều này. Đã sửa: cập nhật `CONTRIBUTING.md`.

r2: `[code-review r2] clean`, `[business-review r2] clean`.

## AI log (`docs/ai-collaboration.md`)

- **Không có case mới.** Dòng #17 và các case C3–C5 (đúng 3 finding ở trên, C3 gồm cả comment `Amended:`) đã có sẵn từ #21.
- **Đã chỉnh trong sandbox:**
  - Mục `Decided by` của C3–C5 giờ ghi `agent (approve=auto)`, đúng như **How to add an entry** quy định. Trước đó ghi "reviewer finding".
  - Mục `AI proposal` của C3 giờ ghi rõ là chính contract đã yêu cầu `$onUpdate`. Trước đó C3 chỉ quy cho implementer.
- **Chưa commit, chưa push** vì đây là dry run. Commit dự kiến: `docs(docs): log AI collaboration (#6)`. PR #17 đã merge nên commit này cần một branch mới (xem câu hỏi 2).

## Đề xuất retro (chưa áp dụng cái nào)

Chi tiết trong `retro.md`. Xếp từ nặng đến nhẹ:

1. **R1 (major):** prompt của agent Contract không đọc các invariant trong CLAUDE.md, nên contract mới yêu cầu `$onUpdate`. Đề xuất: role 3 phải đọc các invariant và ghi rõ nguồn giá trị của từng cột do app set.
2. **R2 (minor):** Implementer vẫn có thể ghi "implementation note" và viết test chép lại kết quả code đang chạy ra. Đề xuất: mọi khác biệt so với contract đều phải đi qua `decision-needed:`, và giá trị expected trong test phải lấy từ contract.
3. **R3 (minor):** runbook chỉ nói cách xử lý tiêu chí phụ thuộc giờ hoặc DST. Đề xuất: mở rộng sang mọi tiêu chí mà API không cho thấy được, và để spec ghi sẵn cách quan sát từng tiêu chí.
4. **R4 (minor):** thêm quy tắc đặt tên constraint (`<table>_pkey`) vào bảng Naming trong `CONTRIBUTING.md`.
5. **R5 (minor):** Finish bước 2 mặc định là branch của PR vẫn còn. Đề xuất: nếu PR đã merge thì mở một PR `docs/` riêng.
6. **R6 (low):** khi chạy `approve=auto`, report cuối phải liệt kê mọi lựa chọn ở gate và mọi `Amended:` mà agent đã tự quyết.

## Việc thủ công còn lại theo môi trường

Lấy từ `docs/environment-setup.md`. Mục **Manual steps** trong body của PR #17 không có trong record nên mình chưa đối chiếu được.

- **Local (Node chạy trên máy):**
  1. `docker compose up -d postgres`
  2. `cp apps/api/.env.example apps/api/.env`
  3. `pnpm --filter @inventory/api db:migrate`
  4. `pnpm dev`

  Chạy lại `db:migrate` mỗi khi có migration mới.
- **Docker Compose:** `docker compose up --build`, không cần thêm bước nào.
- **Test:** `pnpm test:integration` và `pnpm verify` cần Docker daemon đang chạy.
- **Deployed:** chưa có môi trường nào. Trước lần deploy đầu tiên:
  - set secret `DATABASE_URL` và một `JWT_SECRET` mới;
  - mỗi release chạy `node db/migrate.ts` một lần, trước khi api mới khởi động.

## Câu hỏi cho bạn

1. Áp dụng đề xuất retro nào?
   - A: R1–R5 trong một PR `chore/`, bỏ R6.
   - B: chỉ R1 và R2.
   - C: tất cả R1–R6.

   **Đề xuất: C.** R6 chỉ là một câu trong Finish bước 4 và giúp bạn kiểm tra những gì agent tự quyết khi chạy `auto`.
2. Phần chỉnh AI log (C3–C5) vào đâu?
   - A: một PR riêng `docs/6-ai-log`.
   - B: gộp vào PR `chore/` của retro.
   - C: bỏ.

   **Đề xuất: A.** Đây là thay đổi narrative, tách khỏi thay đổi môi trường thì dễ review hơn.

PR #17 đã merge. Mình chưa kiểm tra được worktree và branch đã được dọn theo CLAUDE.md **Agent workflow** hay chưa.
