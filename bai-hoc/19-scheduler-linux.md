# Bài 19 — Scheduler thực tế trong Linux

[Mục lục](../README.md) · [← Bài 18](18-ly-thuyet-lap-lich.md) · [Bài 20 →](20-real-time-linux.md)

## Mục tiêu

Cần bài 18. Hiểu class/policy, nice, affinity và sự khác biệt giữa công bằng CPU với deadline thời gian thực.

## 1. Task runnable và CPU

Scheduler chọn task có thể chạy; task đang chờ I/O không giành CPU như task runnable. Trên SMP có cấu trúc hàng đợi theo CPU và cơ chế cân bằng tải. Migration có thể tăng khả năng dùng CPU nhưng làm mất locality cache; affinity giới hạn tập CPU được phép chạy, không tự dành riêng chúng.

Policy là giao diện lựa chọn hành vi của task, còn scheduling class là tổ chức triển khai scheduler. `SCHED_OTHER` phục vụ workload bình thường; `SCHED_BATCH` thiên về batch; `SCHED_IDLE` có mức ưu tiên rất thấp. Các class và tính năng bổ sung phụ thuộc kernel/cấu hình.

## 2. Nice, CFS và EEVDF

Nice thường nằm từ −20 đến 19: số nhỏ thuận lợi hơn trong nhóm lập lịch công bằng. Nice được chuyển thành weight; đó không phải tỷ lệ CPU cố định. Phần CPU còn phụ thuộc đối thủ runnable, cgroup, autogroup, affinity và thời gian task bị block.

Trong mô hình CFS, `vruntime` tăng theo thời gian CPU đã dùng và tỷ lệ nghịch với weight; task “được phục vụ ít hơn” có cơ hội chạy. Với EEVDF, tính đủ điều kiện và virtual deadline giúp cân bằng công bằng với đáp ứng. Virtual deadline không phải deadline tuyệt đối cho ứng dụng real-time. Linux bắt đầu chuyển cơ chế fair scheduling sang EEVDF từ kernel 6.6; chi tiết còn phụ thuộc phiên bản và backport. [Tài liệu EEVDF](https://kernel.org/doc/html/latest/scheduler/sched-eevdf.html)

## 3. Lab: tranh chấp cùng một CPU

Chạy trong VM, cùng terminal Bash. Chọn một CPU thực sự được phép từ affinity hiện tại, không mặc định CPU 0:

```bash
lab_cpu=$(python3 -c 'import os; print(min(os.sched_getaffinity(0)))')
taskset -c "$lab_cpu" timeout 15s python3 -c 'while True: pass' &
p1=$!
taskset -c "$lab_cpu" nice -n 10 timeout 15s python3 -c 'while True: pass' &
p2=$!
ps -eo pid,ppid,ni,cls,psr,pcpu,args --forest
wait "$p1"
wait "$p2"
```

`$!` ở đây là process wrapper `timeout`; dùng `ps --forest` hoặc `pstree` để tìm Python con. Trong 15 giây, dùng `top` ở terminal khác hoặc `pidstat` nếu đã cài sysstat. Lần sau chạy cả hai nice 0 để so sánh.

Kỳ vọng task nice 0 nhận nhiều CPU hơn nice 10 khi cạnh tranh đúng một CPU. Không chốt một tỷ lệ đo chính xác vì môi trường có các tầng chia tài nguyên khác. Status 124 từ `timeout` là kết thúc theo giới hạn thời gian, không phải lỗi bất ngờ của lab.

## 4. Đọc số liệu đúng

`psr` là CPU gần nhất, không phải tập affinity; `taskset -pc PID` mới cho biết mask hiện tại. Context switch tự nguyện thường do block/yield, không tự nguyện thường do bị lấy CPU; số cao tự nó chưa chứng minh vấn đề.

Nice không sửa task bị chờ disk, lock hoặc quota. Giảm nice về giá trị số nhỏ hơn thường cần đặc quyền hoặc resource limit phù hợp; tăng nice để giảm ưu tiên thường có thể làm bằng user thường.

## 5. Kiểm tra đạt

Nộp kết quả hai lần chạy cùng nice và khác nice. Giải thích vì sao pin hai task vào hai CPU rảnh có thể khiến cả hai gần đủ một CPU dù nice khác nhau, và vì sao affinity không tạo CPU độc quyền.

## Đọc thêm

`man 7 sched`, `man nice`, `man taskset`; [CFS design](https://docs.kernel.org/scheduler/sched-design-CFS.html).
