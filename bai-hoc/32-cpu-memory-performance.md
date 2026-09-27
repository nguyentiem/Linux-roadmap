# Bài 32 — Phân tích CPU và bộ nhớ chuyên sâu

[Mục lục](../README.md) · [← Bài 31](31-phuong-phap-hieu-nang.md) · [Bài 33 →](33-io-network-performance.md)

## Mục tiêu: ứng dụng dùng CPU, đợi CPU hay đợi bộ nhớ?

Một request mất một giây, nhưng process chỉ thực thi 20 ms; thêm CPU chưa chắc giải quyết 980 ms còn lại. Một ứng dụng có RSS tăng cũng chưa chắc leak. Bài này tách thực thi, runnable wait, chờ khóa/I/O, reclaim và giới hạn nhóm tài nguyên trước khi chọn cách tối ưu. Cần bài 17, 19, 31. Lab dùng một process CPU có hạn thời gian, một process ngủ và mapping nhỏ; không cố gây OOM hay làm đầy RAM máy.

Sau bài, bạn cần đọc CPU time/wall time và accounting, nối run queue/context switch với giả thuyết, phân biệt reserve/touch/RSS/PSS, đọc PSI cùng cgroup/NUMA, thu chuỗi mẫu và giải thích giới hạn. Các phần perf/NUMA sâu là nhánh quan sát khi công cụ/phần cứng cho phép, không thay kernel parameter để vượt quyền.

## 1. Một giây trôi qua có phải một giây CPU được dùng?

**CPU** là bộ xử lý chạy chỉ thị; **process**, tiến trình, là một lần chạy chương trình có bộ nhớ/tài nguyên và PID (mã số nhận diện). **Thread**, luồng thực thi, là đơn vị công việc scheduler chọn chạy trong một process. **Scheduler** là bộ lập lịch chọn công việc dùng CPU. **Wall time**, thời gian trôi theo quan sát, gồm cả chờ; **CPU time** cộng thời gian thực thi thực trên CPU theo phạm vi đo. Process nhiều thread có thể có CPU time lớn hơn wall time nếu chạy song song.

**User space** là nơi mã ứng dụng ngoài kernel thực thi; **kernel**, lõi hệ điều hành, xử lý tài nguyên và yêu cầu hệ thống. **User time** là thời gian thực thi mã user space; **system time** là thời gian kernel phục vụ công việc theo accounting. **System call**, lời gọi hệ thống, là giao diện như đọc/ghi file từ process vào kernel. Nhiều lời gọi, gói mạng hoặc fault có thể làm system time tăng, nhưng số tăng chưa chỉ ra hàm/cơ chế nào; cần trace phù hợp khi điều tra sâu.

```text
Thread có công việc
  → runnable: chạy ngay hoặc chờ scheduler
  → running: dùng CPU (user/kernel)
  → blocked: đợi khóa/dữ liệu/timer → runnable trở lại
```

**Runnable** là đủ điều kiện chạy, **running** đang thực thi, **blocked/sleeping** là chưa thể tiếp tục cho đến một sự kiện. **Timer** là cơ chế báo sau một mốc thời gian, ví dụ sleep. Mũi tên mô tả vòng đời có thể lặp; request latency có thể nằm ở bất kỳ đoạn nào. **Mutex**, khóa loại trừ, giới hạn một bên truy cập phần chung; thread chờ mutex không nhất thiết chờ scheduler CPU.

Vì vậy phải hỏi “thread đang chạy bao nhiêu, runnable đợi bao nhiêu, ngủ vì đâu?” trước mua CPU. CPU toàn máy rảnh có thể đi cùng một thread bận một core hoặc cgroup bị quota. **Logical CPU**, CPU logic, là đơn vị lập lịch kernel thấy, có thể là core/thread phần cứng hoặc vCPU của VM; số logical CPU không tự quy thành cùng khả năng xử lý trên mọi kiến trúc.

## 2. Các cột CPU và load mô tả điều gì?

**Accounting** là cách kernel/công cụ ghi nhận thời gian/counter, không phải camera nhìn từng thao tác. **Load average** là số task runnable và một số task chờ không ngắt được được làm trơn theo cửa sổ; không phải phần trăm CPU. **Run queue** là tập công việc đủ điều kiện đang chờ CPU theo cơ chế scheduler; vmstat `r` tính cả đang chạy nên không gọi mọi r là số chỉ đang đợi.

```bash
lscpu
vmstat 1 5
pidstat -u -w 1 5
```

`lscpu` mô tả topology/CPU nhìn thấy; affinity/cgroup vẫn có thể giảm CPU thực dùng. **Affinity** là tập CPU thread được phép chạy; **cgroup** là nhóm kernel dùng để theo dõi/giới hạn tài nguyên các process. **Quota** là ngân sách sử dụng trong một kỳ, khác số CPU host đã cài.

Cách đọc các trường thường gặp:

| Trường | Ý nghĩa | Điểm không suy ra trực tiếp |
|---|---|---|
| `us/%usr` | Thời gian mã user | Không chỉ ra hàm nóng hoặc có làm việc hữu ích không |
| `sy/%system` | Thời gian mã kernel | Không tự là “kernel lỗi” |
| `id` | CPU idle theo accounting | Tổng idle không loại trừ bottleneck một thread/giới hạn nhóm |
| `wa` | Iowait: accounting CPU trong hoàn cảnh chờ I/O | Không phải CPU đang thực thi I/O, không đo latency mọi request ổ |
| `st` | Steal time trong VM khi vCPU không được host phục vụ theo accounting | Không tự xác định workload host nào lấy CPU |
| `cswch/s`, `nvcswch/s` | Context switch tự nguyện/không tự nguyện theo task | Cao chưa tự là bệnh, còn phụ thuộc mẫu công việc |

**I/O** là trao đổi dữ liệu như đọc ổ/gửi mạng. **Iowait** không phải một thread trạng thái tên iowait và có những giới hạn accounting trên đa CPU; đọc [proc_stat](https://man7.org/linux/man-pages/man5/proc_stat.5.html). **Context switch** là chuyển CPU sang task khác, có thể vì task tự đợi hoặc bị scheduler chuyển đi. **CPU migration** là task chuyển sang CPU khác; nó có thể thay **cache locality**, mức dữ liệu cần nằm gần/còn trong bộ đệm CPU đang dùng. Không phải mọi migration đều xấu; cân bằng tải có thể có lợi.

`pidstat` CPU% cần đọc chế độ chuẩn hóa: mặc định một task dùng một CPU liên tục có thể gần 100%; option chuẩn hóa theo toàn bộ CPU như `-I` làm ý nghĩa khác. `ps %CPU` thường là tỷ lệ trung bình theo vòng đời process, không phải mẫu một giây giống pidstat; không so hai số rồi kết luận công cụ sai. Dòng đầu vmstat nhiều trường tốc độ là trung bình từ boot, process/memory là tức thời; các dòng sau là interval. Xem [pidstat](https://man7.org/linux/man-pages/man1/pidstat.1.html) và [vmstat](https://man7.org/linux/man-pages/man8/vmstat.8.html).

## 3. Nếu CPU bận, cần biết nó làm gì hiệu quả đến đâu?

**Hot path** là chuỗi xử lý dùng nhiều thời gian/tài nguyên trong workload, nơi thay đổi có thể có tác động lớn. **Instruction** là chỉ thị máy; **cycle** là nhịp/bộ đếm chu kỳ CPU theo sự kiện phần cứng; **IPC**, instructions per cycle, là số chỉ thị hoàn tất trên chu kỳ được đo. **Cache miss** là truy cập không tìm được dữ liệu trong tầng cache xét; **branch miss** là dự đoán nhánh không đúng theo sự kiện bộ đếm. Chúng cần kiến trúc, event và workload cùng điều kiện; IPC cao không tự nghĩa request nhanh hơn nếu làm nhiều công việc thừa.

**PMU**, Performance Monitoring Unit, là bộ đếm phần cứng hỗ trợ đo sự kiện; **perf stat** là công cụ Linux tổng hợp các counter. VM có thể không cấp PMU, hoặc quyền perf bị hạn chế. Có perf binary không đồng nghĩa mọi event dùng được. Nhánh tùy chọn trong VM lab:

```bash
perf stat -e task-clock,context-switches,cpu-migrations,page-faults \
    python3 -c 'sum(i*i for i in range(1000000))'
```

Đây là một job có số vòng hữu hạn, không benchmark production. `task-clock` mô tả thời gian task theo công cụ, `context-switches`/`cpu-migrations` là đếm sự kiện và `page-faults` đếm fault, không riêng major fault. Nếu có hỗ trợ, thử riêng `perf stat -e cycles,instructions` trên cùng job; ghi event unavailable/permission denied thay vì đổi `perf_event_paranoid` hay chạy quyền rộng để ép lab. Các counter multiplexed có thể được scaling khi không đo đồng thời đủ, đọc phần running/enabled/time hoặc ghi chú của output. [perf-stat](https://man7.org/linux/man-pages/man1/perf-stat.1.html).

**Trace** là ghi chuỗi sự kiện/lời gọi để hiểu cơ chế; nó có overhead và có thể bỏ/giới hạn dữ liệu theo công cụ. perf stat cho tổng số, không cho stack/hàm nào nóng; bài 34 đi sâu sampling/tracing. Trước tối ưu phải giữ phép thử chức năng và workload để tránh giảm thời gian bằng bỏ tính đúng đắn.

## 4. RAM còn bao nhiêu khác working set cần bao nhiêu?

**Virtual memory**, bộ nhớ ảo, là không gian địa chỉ process thấy được kernel ánh xạ tới các nguồn. **Mapping** là một vùng địa chỉ có quy tắc nguồn/quyền. **Reserve**, dành vùng địa chỉ, có thể chưa làm mọi byte hiện diện thực trong RAM. **Touch** là truy cập trang khiến hệ thống phải chuẩn bị vùng cần dùng; **page**, trang, là đơn vị quản lý bộ nhớ, lấy kích thước thực bằng `getconf PAGESIZE` hoặc API hệ thống.

**RSS**, Resident Set Size, là lượng trang process đang resident (hiện diện) theo phép đo; **PSS**, Proportional Set Size, chia phần trang dùng chung theo tỷ lệ giữa các mapping/process dùng để tính, giúp tránh cộng toàn bộ shared nhiều lần. **Anonymous memory** là vùng không dựa trực tiếp vào file thông thường, như heap; **file-backed memory** là vùng có nguồn file; **shared memory** là vùng có thể chia sẻ theo cơ chế mapping. **Working set** là dữ liệu/code thực cần trong cửa sổ công việc đã chọn, không chỉ tổng virtual size hoặc RSS tại một mốc.

**Page fault** là kernel xử lý khi truy cập trang chưa sẵn sàng theo mapping/quyền, có thể hoàn toàn bình thường. **Minor fault** thường xử lý không cần tải trang từ storage; **major fault** yêu cầu bước đọc từ storage theo accounting. Major fault có thể do file-backed page, không riêng swap. **Swap** là nơi hỗ trợ đưa một số trang ra ngoài RAM để quản lý bộ nhớ; **swap-in** là đọc chúng trở lại, không đồng nghĩa mọi major fault là swap-in.

**Reclaim** là thu hồi bộ nhớ có thể tái dùng, như bỏ cache sạch hoặc ghi/đưa trang phù hợp ra storage. **Direct reclaim** là trường hợp đường cấp phát phải tự tham gia thu hồi trước tiếp tục; **thrashing** là hệ dành nhiều thời gian xoay vòng trang hơn làm việc hữu ích. Ứng dụng có thể chậm trước khi kernel quyết định OOM. `free` thấp chưa tự là lỗi vì RAM đang làm cache; xem available, hoạt động reclaim/fault/swap và PSI cùng workload. [Kernel memory concepts](https://docs.kernel.org/admin-guide/mm/concepts.html).

**Memory leak**, rò rỉ bộ nhớ, là vùng được giữ/cấp mà không còn phục vụ mục đích cần thiết nhưng không được giải phóng đúng vòng đời. RSS không giảm sau một request có thể do allocator/cache giữ lại để tái dùng. **Allocator** là cơ chế cấp/quản lý vùng nhớ của runtime/thư viện; cần nhiều vòng request tương đương, cơ chế cache/bộ đệm và các phần tăng để xây giả thuyết leak. Một ảnh RSS cao chưa đủ.

## 5. PSI, cgroup và NUMA thêm những ranh giới nào?

**PSI**, Pressure Stall Information, mô tả phần thời gian task bị đình trệ vì tài nguyên. `some` là có ít nhất một phần task stall; memory/I/O `full` nói mọi task không idle trong phạm vi stall đồng thời theo cơ chế đó. CPU full toàn hệ thống không được định nghĩa tương tự và được báo 0 trong các kernel áp dụng. `avg10/60/300` là xu hướng phần trăm cửa sổ, `total` là microsecond tích lũy. Không diễn giải total là số lần fault hoặc số byte.

```bash
cat /proc/pressure/cpu
cat /proc/pressure/memory
cat /proc/pressure/io
cat /proc/self/cgroup
```

`/proc` là cây thông tin kernel; `self` là process đang đọc. Trong cgroup v2, dòng ví dụ `0::/user.slice/...` cho đường nhóm trong môi trường nhìn thấy; mount namespace có thể làm cách nối vào `/sys/fs/cgroup` cần kiểm tra. **Namespace** là cơ chế tạo góc nhìn riêng về một số tài nguyên, container có thể ẩn ancestor của cgroup. **Mount** gắn một filesystem vào thư mục; **filesystem** là cách tổ chức cây tên. `findmnt -t cgroup2` xác định vị trí cây cgroup v2, không gán mọi hệ là v2.

Trong nhóm/ancestor có quyền đọc, `cpu.max` là quota/period (`max` là không quota tại lớp đó); `cpu.stat` có `nr_throttled` và `throttled_usec` để xem throttle theo thời gian; `memory.current`, `memory.max`, `memory.events` cho dùng/giới hạn/events; `memory.pressure` cho PSI nhóm. **OOM kill** là process bị cơ chế thiếu nhớ kết thúc trong phạm vi xét. Có host còn RAM nhưng cgroup chạm limit vẫn có thể OOM. Events là counter tích lũy, lấy delta trong cửa sổ, không thấy số lớn rồi gọi là lỗi hiện tại. Ancestor có thể đặt giới hạn dù leaf `max`; nếu container không lộ ancestor, ghi không đủ dữ liệu. Không sửa file cgroup để thử OOM. [Cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html), [PSI](https://docs.kernel.org/accounting/psi.html).

**NUMA**, Non-Uniform Memory Access, là kiến trúc CPU/RAM được chia theo **node**, nhóm có quan hệ truy cập bộ nhớ; **local memory** gần CPU xét, **remote memory** thuộc node khác và thường có chi phí khác. **Memory placement**, bố trí trang ở node nào, phối hợp với CPU placement quyết định chi phí. Pin CPU (ràng CPU theo affinity) mà không xét trang nhớ có thể làm tệ hơn.

```bash
lscpu
numastat
```

Nếu có numactl, `numactl --hardware` đọc topology; `numastat -p PID_THUC` xem phân bổ process mà bạn được phép đọc, thay PID thật. Counters NUMA miss/foreign/node hit có nghĩa theo công cụ/policy, không phải tỷ lệ cache miss CPU hay trực tiếp latency RAM. Xem [NUMA memory policy](https://www.kernel.org/doc/html/latest/admin-guide/mm/numa_memory_policy.html) và `man numastat`. Một VM nhỏ chỉ lộ một node không chứng minh host vật lý không NUMA; nó chỉ giới hạn phép quan sát khách.

## 6. Lab: một job tính toán và một job ngủ

### 6.1. Chuẩn bị phép thử có thời hạn

Trong VM lab có Python3/procps/coreutils và sysstat nếu muốn pidstat. **Shell** là trình diễn giải lệnh; `&` chạy nền, `$!` là PID của lệnh nền mới nhất. Chạy một workload tại một thời điểm, không lặp theo số CPU. Job Python dùng một luồng chính và vòng lặp 6 giây theo đồng hồ monotonic (đo khoảng không nhảy khi chỉnh giờ), thêm wrapper timeout 8 giây để giới hạn nếu có vấn đề:

```bash
cpu_lab=$(mktemp -d "${TMPDIR:-/tmp}/linux-cpu.XXXXXX")
cat > "$cpu_lab/busy.py" <<'PY'
import os
import time
print("python_pid=%d" % os.getpid(), flush=True)
end = time.monotonic() + 6
value = 0
while time.monotonic() < end:
    value = (value + 1) % 1000000
PY
timeout 8s python3 "$cpu_lab/busy.py" > "$cpu_lab/busy.log" &
wrapper_pid=$!
sleep 0.2
cat "$cpu_lab/busy.log"
ps -eo pid,ppid,stat,pcpu,wchan:24,args --forest
```

Tìm PID Python trong log rồi dòng ps có PPID của timeout; wrapper PID khác worker PID. **STAT** là mã trạng thái như `R` runnable/running, `S` ngủ có thể bị đánh thức; **wchan** là tên điểm chờ kernel nếu có quyền/dữ liệu, có thể là `-`/`0` khi chạy hoặc bị hạn chế. `%CPU` của ps là trung bình đời process, dùng pidstat interval để thấy mẫu.

Nếu đã có sysstat, trong lúc còn 6 giây, dùng terminal khác `pidstat -u -w -p PID_PYTHON 1 4` thay PID thực, hoặc theo dõi toàn máy như bài 31. Khi job kết thúc, terminal đầu:

```bash
wait "$wrapper_pid"
printf 'busy wrapper status=%s\n' "$?"
sleep 6 &
sleep_pid=$!
ps -p "$sleep_pid" -o pid,stat,pcpu,wchan:24,args
pidstat -u -w -p "$sleep_pid" 1 4
wait "$sleep_pid"
```

Bỏ lệnh pidstat nếu chưa có, không thay bằng chạy nhiều load. Busy kết thúc tự nhiên thường mã 0; timeout nếu đạt 8 giây thường 124. Sleeping task có wall time 6 giây nhưng CPU time gần 0, STAT thường S và wchan tương tự hàm ngủ high-resolution timer; tên chính xác tùy kernel/quyền. Busy một CPU có thể gần 100% task CPU nhưng tổng máy nhiều CPU thấp. Dòng R không chứng minh thread đã liên tục chạy và không đợi.

Ghi ít nhất 3 mẫu CPU/time/state, mốc bắt đầu/kết thúc và phạm vi; không kết luận có runnable pressure chỉ vì busy worker bận. PSI CPU có thể không tăng đáng kể khi còn CPU rảnh. Đó là giới hạn hợp lệ của workload một luồng, không cần gây thêm tải để “đẹp kết quả”.

### 6.2. Đối chiếu CPU time và wall time bằng API nhỏ

```bash
python3 - <<'PY'
import time
wall = time.monotonic()
cpu = time.process_time()
time.sleep(0.5)
print("wall_seconds=%.6f cpu_seconds=%.6f" %
      (time.monotonic() - wall, time.process_time() - cpu))
PY
```

`process_time` đo CPU của process hiện tại theo API Python, không cộng mọi công việc con ngoài phạm vi đó. Mong wall gần/ít nhất khoảng 0,5 giây theo lập lịch và CPU rất nhỏ; không buộc bằng chính xác. [Python time](https://docs.python.org/3/library/time.html) mô tả phạm vi clock. Đây là phép chứng minh khái niệm thời gian, không phép đo scheduler latency real-time.

## 7. Lab: reserve/touch với vùng nhỏ và chuỗi sample

Có thể chạy lại bài 17, nhưng ví dụ tự chứa dưới đây dùng mapping **private anonymous** (vùng riêng, không dựa file) trên Linux. Chọn 16 MiB mặc định; chỉ nâng lên 64 MiB trong VM đủ RAM và giới hạn nhóm. Nếu VM rất nhỏ, giảm `SIZE`; không tăng tới khi thấy OOM. Một Python `bytearray` tạo sẵn có thể đã touch, nên không dùng nó để hứa “reserve chưa cấp trang”.

```bash
cat > "$cpu_lab/memory_demo.py" <<'PY'
import mmap
import os
import time

SIZE = 16 * 1024 * 1024
PAGE = os.sysconf("SC_PAGE_SIZE")
region = mmap.mmap(-1, SIZE,
                   flags=mmap.MAP_PRIVATE | mmap.MAP_ANONYMOUS,
                   prot=mmap.PROT_READ | mmap.PROT_WRITE)
print("pid=%d phase=reserved bytes=%d page=%d" %
      (os.getpid(), SIZE, PAGE), flush=True)
time.sleep(4)
for offset in range(0, SIZE, PAGE):
    region[offset] = 1
print("phase=touched", flush=True)
time.sleep(4)
region.close()
print("phase=unmapped", flush=True)
time.sleep(2)
PY
timeout 12s python3 "$cpu_lab/memory_demo.py" > "$cpu_lab/memory.log" &
memory_wrapper=$!
sleep 0.2
cat "$cpu_lab/memory.log"
```

Lấy PID từ log, đọc theo pha trên terminal khác:

```bash
memory_pid=THAY_PID_THUC
cat "/proc/$memory_pid/smaps_rollup"
cat "/proc/$memory_pid/status"
vmstat 1 5
cat /proc/pressure/memory
```

Không paste placeholder làm PID. **smaps_rollup** tổng hợp thống kê mapping của process; `Rss`, `Pss`, `Anonymous` và các trường Pss_Anon/Pss_File/Pss_Shmem nếu có mô tả lớp bộ nhớ. `/proc/PID/status` có VmSize/VmRSS và RssAnon/RssFile/RssShmem, một số accounting nhanh là ước lượng; rollup có cách lấy dữ liệu chi tiết hơn nhưng cũng có chi phí. Kernel/quyền có thể không cung cấp tất cả trường. Chỉ đọc process của mình; không mở rộng quyền khi bị hạn chế.

Trước touch, virtual mapping đã tăng nhưng resident chưa cần bằng cả SIZE; sau ghi mỗi page, anonymous RSS thường tăng gần 16 MiB cộng/chênh hoạt động khác. **Huge page**, trang lớn, và cơ chế THP (Transparent Huge Pages, tự quản lý trang lớn) có thể thay granularity; không ép mọi dòng đúng từng KiB. Sau region.close, mapping bị gỡ; vẫn còn Python/runtime/cache thuộc vùng khác nên RSS không về 0. Xem [proc filesystem](https://docs.kernel.org/filesystems/proc.html).

Khoảng ngủ 4 giây giúp lấy mẫu, không đảm bảo bạn đọc kịp: nếu process đã kết thúc thì `/proc/PID` biến mất; đọc log/mốc và chạy lại một lần có giới hạn thay vì gán PID cũ. Để thu chuỗi 1 giây chủ động, dùng pidstat `-r -p PID_THUC 1 8` khi có, ghi pha theo log. Kết thúc `wait "$memory_wrapper"`, đọc status/log.

Nếu memory PSI không tăng, vmstat không có swap/reclaim đáng kể, kết luận lab chứng minh reserve/residency và touch, **chưa kiểm tra pressure/reclaim/OOM**. Không drop cache, tắt swap, đổi memory.max hay làm đầy máy để tạo điều kiện thiếu nhớ. Với process thực, lấy mẫu qua nhiều vòng công việc và đối chiếu số request/cache trước khi nêu leak.

## 8. Khi có bằng chứng, hướng tối ưu nào hợp lý?

| Bằng chứng đã thu đúng phạm vi | Hướng thử riêng từng biến | Giới hạn/kiểm chứng sau thay đổi |
|---|---|---|
| Runnable wait/CPU pressure cao và hot path đã xác định | Giảm công việc, tối ưu đường nóng, cân nhắc thêm CPU sau kiểm tra capacity | Đo latency/throughput và tính đúng, không chỉ CPU% |
| Thread đợi mutex chung | Giảm critical section hoặc chia dữ liệu/khóa phù hợp | Không mặc định thêm thread sẽ nhanh |
| Working set gây reclaim/swap liên tục | Giảm working set, cải thiện locality hoặc tăng RAM | Cần chứng minh do workload, không chỉ free thấp |
| Cgroup throttle cùng cửa sổ chậm | Xem quota/ancestor và nhu cầu cấp phát | Host nâng cấp chưa tự tăng quota |
| NUMA remote có chi phí với workload | Xét CPU và memory placement cùng nhau | Benchmark topology thật, VM một node không kiểm được điều này |

**Critical section** là đoạn xử lý tài nguyên chung cần bảo vệ; **sharding** là chia dữ liệu/công việc thành phần nhỏ để giảm chia sẻ, có thể tăng độ phức tạp. **Capacity** là khả năng phục vụ công việc trong điều kiện đã chọn. Các hướng là giả thuyết cần thử, không lệnh sửa universal. Lưu cấu hình cũ và phép đo trước/sau; dừng nếu thử vượt ngân sách lab.

## 9. Tự kiểm tra và phần nộp

1. Sleeping 6 giây có CPU time 6 giây không? **Tiêu chí:** không, wall gồm chờ; xác nhận bằng mẫu/time API.
2. ps CPU% thấp hơn pidstat lúc mới bắt đầu tải. Có phải một tool sai? **Tiêu chí:** kiểm tra vòng đời trung bình và interval/normalization.
3. `wa` cao chứng minh CPU đang tính dữ liệu I/O? **Tiêu chí:** không, accounting iowait khác CPU execution/latency request.
4. Major fault tăng nhưng swap-in không tăng: có thể không? **Tiêu chí:** có thể đọc file-backed data, không đồng nhất major fault với swap.
5. Host nhiều RAM nhưng cgroup oom_kill tăng trong cửa sổ: xem lớp nào? **Tiêu chí:** nhóm/ancestor limit và events, không chỉ free host.
6. RSS giữ sau request có chắc leak? **Tiêu chí:** cần chuỗi workload, cache/allocator/vòng đời và phần tăng không được tái dùng.
7. Pin CPU nhưng trang ở remote node: điều gì cần đo? **Tiêu chí:** CPU/memory placement cùng nhau và workload, không chỉ affinity.
8. Touch 16 MiB không PSI memory. Lab có thất bại? **Tiêu chí:** không; phạm vi mapping/residency, chưa gây pressure.

Nộp chuỗi mẫu busy/sleeping, reserve/touch/unmap; CPU/RSS/PSS và pha; version/kernel/cgroup/NUMA nhìn thấy; kết luận tách “đã quan sát” và “chưa đo”. Không nộp số minh họa như dữ liệu thật. Tự nhắc: wall time khác CPU time → chạy/đợi CPU/chờ sự kiện khác nhau → virtual khác resident/working set → giới hạn cgroup và vị trí NUMA đổi khả năng phục vụ. Bài 33 nối những ranh giới đó với storage/mạng.

## Nguồn đối chiếu

- [pidstat](https://man7.org/linux/man-pages/man1/pidstat.1.html), [vmstat](https://man7.org/linux/man-pages/man8/vmstat.8.html), [perf stat](https://man7.org/linux/man-pages/man1/perf-stat.1.html): cách tính/counter/interval.
- [proc](https://docs.kernel.org/filesystems/proc.html), [memory concepts](https://docs.kernel.org/admin-guide/mm/concepts.html), [PSI](https://docs.kernel.org/accounting/psi.html): mapping, residency và stall.
- [Cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html), [NUMA policy](https://www.kernel.org/doc/html/latest/admin-guide/mm/numa_memory_policy.html), [numastat](https://man7.org/linux/man-pages/man8/numastat.8.html): phạm vi limit và placement.
- [Python mmap](https://docs.python.org/3/library/mmap.html), [Python time](https://docs.python.org/3/library/time.html): mapping anonymous và clock dùng trong lab.

Tài liệu trực tuyến có thể mới hơn máy; ghi `uname -r`, `pidstat -V`, `python3 --version`, `perf --version`. Perf events, /proc fields, PSI và NUMA tùy kernel/quyền/VM; thiếu phải được ghi là giới hạn, không thay sysctl của host để ép kết quả.
