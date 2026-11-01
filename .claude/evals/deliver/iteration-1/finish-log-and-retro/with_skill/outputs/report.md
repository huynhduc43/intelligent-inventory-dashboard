# /deliver #6: Finish

- **Issue:** [#6](https://github.com/huynhduc43/intelligent-inventory-dashboard/issues/6) "Skeleton: validated config, Drizzle migrations, DB readiness, Docker Compose"
- **PR:** [#17](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/17) (đã merge ngày 2026-11-01)
- **Chế độ:** `grill=auto`, `approve=auto`

## Số vòng

**1 vòng sửa** (Implementer sửa một lần, commit `92c22c6`). Review chạy hai lượt: r1 có 3 finding, r2 cả hai reviewer đều `clean`. Còn xa giới hạn 3 vòng.

## Tester

**pass** (r2): 6 tiêu chí chạy trên `docker compose up`. Có 2 tiêu chí (`statement_timeout`, `Clock`) ghi "pass (via test)" vì API không cho thấy được; hai tiêu chí này dựa vào test, không dựa vào `curl` (xem retro mục 3).

## Comment của reviewer

Cả 3 finding r1 đã sửa trong `92c22c6`, r2 không còn comment nào mở:

1. [code-review r1] minor, `apps/api/src/shared/schema.ts:105`: `$onUpdate(() => sql\`now()\`)` đọc `now` trong SQL nên test không ghim được `Clock`. Đã bỏ `$onUpdate`; issue #6 có comment `Amended:`, sau này thành ADR 0002.
2. [business-review r1] Spec minor: PK tên mặc định của Drizzle thay vì `user_dealership_pkey` như contract, lại bị ghi là "implementation note" dưới "Deviations: None". Đã đặt tên lại và thêm test kiểm tra mọi PK có dạng `<table>_pkey`.
3. [business-review r1] Standards minor: `vitest.config.ts` loại `src/shared/schema.ts` khỏi coverage nhưng CONTRIBUTING.md không ghi. Đã cập nhật CONTRIBUTING.md.

r2: `[code-review r2] clean`, `[business-review r2] clean`, `[tester r2] pass`.

## AI log (`docs/ai-collaboration.md`)

**Không thêm case mới**: dòng #17 và các case C3–C5 đã có sẵn trong log (viết ở #21) và khớp với 3 finding ở trên. Tôi đã sửa chúng cho đúng với record và với format **How to add an entry**:

- **C3:** lỗi `$onUpdate` bắt nguồn từ **contract** (agent soạn contract ghi `$onUpdate` và `Chosen:` giữ nguyên), không phải do implementer tự nghĩ ra.
- **C3–C5:** `Decided by` đổi thành `agent (approve=auto)`, vì không có cổng nào chờ người dùng.
- **Dòng #17:** "1 fix round (reviews r1, r2)", và ghi rõ 2 tiêu chí của tester chỉ được chứng minh bằng test.

Chưa commit/push (dry run). Lưu ý: PR #17 đã merge nên không thể push lên nhánh của nó như skill yêu cầu. Thay đổi này cần một PR `docs/` riêng vào `dev`, với commit message `docs(docs): log AI collaboration (#6)`. Diff nằm ở `repo-changes.diff`.

## Đề xuất retro (chưa áp dụng cái nào, cần bạn đồng ý)

Chi tiết và diff từng mục ở `retro.md`. Xếp theo mức độ:

1. **(major)** Agent Contract không đọc phần Invariants của CLAUDE.md nên đã soạn `$onUpdate`. Đề xuất: thêm Invariants và ADR vào danh sách cần đọc ở §3 của `deliver/SKILL.md`.
2. **(major)** Chưa có check tự động nào chặn `$onUpdate`. Đề xuất: thêm rule `no-restricted-syntax` vào `eslint.config.mjs`, và một dòng cho code reviewer: "update `vehicle` mà không set `updated_at`" (ADR 0002).
3. **(moderate)** Verdict "pass (via test)" là do Tester tự nghĩ ra. Đề xuất: `deliver-tester.md` quy định rằng tiêu chí API không cho thấy được chỉ tính là pass khi Tester tự chạy test đó.
4. **(minor)** CONTRIBUTING.md chép lại danh sách exclude của `vitest.config.ts`, nên hai nơi lệch nhau. Đề xuất: thay danh sách bằng một con trỏ tới config, và ghi lý do bằng comment ngay trong config.
5. **(minor)** Câu "Deviations lists each decision…" trong `deliver-implementer.md` hẹp quá, nên khác biệt so với spec lọt qua dưới dạng "implementation note". Đề xuất: đổi thành "every difference from the spec".
6. **Câu hỏi cho bạn:** khi `approve=auto`, cổng Contract có nên dừng chờ bạn mỗi khi contract đổi schema hoặc permission không?
   - A. Không, agent tự quyết và AI log ghi lại.
   - B. Có, luôn chờ bạn.
   - C. Agent cứ tiếp tục, nhưng xin bạn review trước Checkpoint.

   **Đề xuất: B**, vì sau khi merge, sửa một lựa chọn schema phải tốn một migration.

Nếu bạn đồng ý mục nào, tôi sẽ gom chúng vào một PR `chore/`.

## Bước thủ công còn lại (theo `docs/environment-setup.md`)

Record không có phần **Manual steps** của PR #17, nên danh sách dưới đây lấy từ `docs/environment-setup.md`:

- **Local (Node trên máy):**
  1. `docker compose up -d postgres`.
  2. `cp apps/api/.env.example apps/api/.env`.
  3. `pnpm --filter @inventory/api db:migrate`, chạy lại mỗi khi có migration mới.
  4. `pnpm dev`.
- **Docker Compose:** `docker compose up --build`. Không cần bước nào khác (Compose đã tự set `JWT_SECRET` dành cho dev).
- **Test:** `pnpm test:integration` và `pnpm verify` cần Docker daemon đang chạy.
- **Môi trường deploy (chưa có):** trước lần deploy đầu, set secret `DATABASE_URL` và một `JWT_SECRET` mới (`openssl rand -base64 48`, tối thiểu 32 ký tự). Mỗi release, chạy `node db/migrate.ts` từ image api một lần trước khi api mới khởi động.

Merge PR log AI đang chờ bạn quyết định.
