# Bài 32 — Phân tích CPU và bộ nhớ chuyên sâu

[Mục lục](../README.md) · [← Bài 31](31-phuong-phap-hieu-nang.md) · [Bài 33 →](33-io-network-performance.md)

## Mục tiêu

Cần bài 17, 19, 31. Tách CPU execution, runnable wait, reclaim và giới hạn tài nguyên trước khi quyết định thêm CPU/RAM.

## 1. Đọc CPU theo nguyên nhân

User time là thời gian thực thi user space; system time là kernel phục vụ workload. Nhiều syscall, packet hoặc page fault có thể tăng system time nhưng cần trace để xác định. Iowait là accounting CPU trong hoàn cảnh chờ I/O, không phải “CPU đang thực hiện I/O”; nó không đo trực tiếp latency của mọi request disk.

Run queue dài báo công việc runnable đang cạnh tranh. Context switch cao có thể do workload hợp lệ nhiều request ngắn hoặc do contention. CPU migration làm thay cache locality. Cache miss, branch miss và instructions/cycle chỉ có ý nghĩa cùng kiến trúc, bộ đếm khả dụng và workload.

## 2. Memory pressure và NUMA

Reclaim quá nhiều có thể làm application chậm trước khi OOM. Major fault và swap-in tăng cần liên hệ đường dữ liệu và resident working set. OOM của cgroup cần đọc giới hạn/events của cgroup; đừng chỉ nhìn `free` ở host.

PSI biểu diễn thời gian task bị đình trệ vì CPU, memory hoặc I/O. `some` nói có task bị stall; `full` có ý nghĩa theo resource/phạm vi, không nên đọc system CPU full như memory full. Các trường avg10/60/300 là xu hướng trên cửa sổ và total là thời gian tích lũy. [Tài liệu PSI](https://docs.kernel.org/accounting/psi.html)

NUMA gắn CPU và vùng RAM theo node. Remote memory thường có chi phí khác local; pin CPU mà không xét memory placement có thể làm tệ hơn. Máy VM nhỏ có thể chỉ lộ một node, không đủ để kết luận phần cứng host không NUMA.

## 3. Lab: CPU-bound và sleeping

Chạy một workload tại một thời điểm trong VM:

```bash
timeout 10s python3 -c 'while True: pass' &
wrapper_pid=$!
ps -eo pid,ppid,stat,pcpu,wchan:24,args --forest
wait "$wrapper_pid"
sleep 10 &
sleep_pid=$!
ps -p "$sleep_pid" -o pid,stat,pcpu,wchan:24,args
wait "$sleep_pid"
```

Đồng thời chạy `pidstat -u -w 1 10` ở terminal khác nếu đã cài sysstat. Tìm Python con của timeout. Sleeping task có thời gian tồn tại nhưng gần như không dùng CPU; wall time và CPU time khác nhau.

## 4. Lab: bộ nhớ theo thời gian

Chạy lại chương trình reserve/touch ở bài 17. Trước và sau touch ghi `smaps_rollup`, `vmstat`, memory PSI. Không cố gây OOM toàn máy. Nếu 64 MiB không tạo pressure, kết luận lab chỉ chứng minh mapping/residency, chưa kiểm tra reclaim.

Với một process thực, thu nhiều sample thay vì một snapshot. Theo dõi anonymous RSS, file-backed RSS và PSS; đối chiếu request count/cache của ứng dụng. Memory leak là giả thuyết cần bằng chứng tăng không giới hạn theo vòng đời, không chỉ RSS chưa giảm sau một request.

## 5. Quyết định tối ưu

| Kết quả | Hướng xử lý cần thử |
|---|---|
| CPU runnable wait cao | Giảm việc, tối ưu hot path, thêm CPU sau capacity check |
| Thread chờ khóa | Giảm critical section/sharding, không chỉ thêm thread |
| Working set vượt RAM | Giảm working set, cải thiện locality hoặc tăng RAM |
| Remote NUMA access cao | Xét CPU/memory placement cùng nhau |
| Quota throttle | Kiểm tra cgroup trước nâng cấp host |

## 6. Kiểm tra đạt và đọc thêm

Nộp time series CPU-bound/sleeping và reserve/touch, nêu giới hạn đo. Tra `man pidstat`, `man numastat`, `man perf-stat`, `man 5 proc`; đọc log OOM theo đúng phạm vi host/cgroup.
