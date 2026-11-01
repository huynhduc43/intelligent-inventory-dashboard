# Báo cáo hoàn tất: issue #6 → PR #17

- **Issue:** https://github.com/huynhduc43/intelligent-inventory-dashboard/issues/6 — "Skeleton: validated config, Drizzle migrations, DB readiness, Docker Compose"
- **PR:** https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/17 (đã merge 2026-11-01)
- **Chế độ:** grill=auto, approve=auto

## Số vòng

**1 vòng** sửa (Implementer chỉ phải xử lý findings một lần, commit `92c22c6`). Reviewer chạy 2 lượt: lượt 1 có 3 finding, lượt 2 cả code-review và business-review đều `clean`. Không chạm giới hạn 3 vòng.

## Kết quả Tester

**pass**: 6/6 tiêu chí chấp nhận, chạy trên `docker compose up`. Hai tiêu chí ghi là "pass (via test)" vì không quan sát được qua API: `statement_timeout` và `Clock`. Hai tiêu chí này dựa vào integration/unit test chứ không phải transcript `curl`.

## Comment của reviewer

Tất cả nằm ở lượt 1, đều mức minor, và đã được sửa hết trong `92c22c6`. Không còn comment follow-up nào mở.

1. **[code-review]** `apps/api/src/shared/schema.ts:105`: `$onUpdate(() => sql\`now()\`)` lấy `now()` trong SQL, trái với quy tắc "now lấy từ `Clock` được inject". Đã sửa: bỏ `$onUpdate`, mỗi lệnh update trong service tự set `updatedAt: clock.now()`. Issue #6 có comment `Amended:` ghi lại thay đổi này (sau đó thành ADR 0002).
2. **[business-review, Spec]** PK của `user_dealership` mang tên mặc định của Drizzle (`user_dealership_user_id_dealership_id_pk`) thay vì `user_dealership_pkey` như contract. PR còn ghi điểm này là "implementation note" dưới "Deviations: None from the spec". Đã sửa: đặt tên PK, và thêm test kiểm tra mọi PK có dạng `<table>_pkey`.
3. **[business-review, Standards]** `vitest.config.ts` loại `src/shared/schema.ts` khỏi coverage trong khi CONTRIBUTING.md chỉ cho phép loại `main.ts` và `*.module.ts`. Đã sửa: CONTRIBUTING.md giờ có liệt kê `schema.ts` kèm lý do.

## Các bước thủ công còn lại, theo môi trường

Lấy từ `docs/environment-setup.md`. Bản ghi không có mục **Manual steps** của PR body, nên danh sách này chưa được đối chiếu với mục đó.

- **Local (Node chạy trên host):** `docker compose up -d postgres`; `cp apps/api/.env.example apps/api/.env`; `pnpm --filter @inventory/api db:migrate` (chạy lại mỗi khi có migration mới trong `apps/api/db/migrations/`); `pnpm dev`, rồi `curl localhost:3000/health/ready`.
- **Docker Compose:** chỉ cần `docker compose up --build`. Compose tự chạy `migrate` và đặt `JWT_SECRET` dùng cho dev. Lệnh `docker compose down -v` sẽ xoá luôn volume DB.
- **Tests:** `pnpm test:integration` / `pnpm verify` cần Docker daemon đang chạy (lần đầu sẽ pull `postgres:17.11-alpine`).
- **Môi trường deploy:** hiện chưa có. Trước lần deploy đầu tiên cần: tạo secret `DATABASE_URL` và một `JWT_SECRET` mới (≥ 32 ký tự, `openssl rand -base64 48`); mỗi release chạy `node db/migrate.ts` từ image api một lần, trước khi bản api mới khởi động. App không tự migrate khi boot.

## Dọn dẹp

PR đã merge. Theo CLAUDE.md **Agent workflow**, bước còn lại là `git worktree remove ../intelligent-inventory-dashboard-6-<topic>` và `git branch -d <type>/6-<topic>`, nếu worktree không còn thay đổi chưa commit hoặc chưa push. Lần chạy này là dry run nên tôi chưa thực hiện bước dọn dẹp.
