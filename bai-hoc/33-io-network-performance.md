# Bài 33 — Phân tích hiệu năng I/O và mạng

[Mục lục](../README.md) · [← Bài 32](32-cpu-memory-performance.md) · [Bài 34 →](34-debug-tracing-crash.md)

## Mục tiêu: “SSD nhanh” hay “mạng nhanh” có nghĩa gì với ứng dụng?

Một ứng dụng tải file chậm, nhưng benchmark ổ cho tốc độ cao và iperf3 cũng tốt. Ba phép đo có thể đúng vì chúng đi qua các đường khác nhau. Bài này giúp định nghĩa thao tác/byte/độ trễ, thiết kế workload có dataset/cache/depth, đọc fio và iperf3, rồi nối kết quả vào giả thuyết ứng dụng. Cần bài 23–25 và 31. Benchmark chỉ ở VM lab, trên file mới hoặc hai đầu mạng lab của bạn; không ghi raw disk, không drop cache hoặc sửa sysctl host.

**Benchmark** là phép thử hiệu năng với điều kiện kiểm soát; **workload** là mẫu công việc như đọc ngẫu nhiên 4 KiB hoặc truyền TCP một luồng; **dataset** là bộ dữ liệu dùng cho phép thử. **I/O**, input/output, là trao đổi dữ liệu vào/ra; **throughput**, thông lượng, là lượng hoàn tất mỗi giây; **latency**, độ trễ, là thời gian một thao tác theo ranh giới đo. Một con số thiếu các điều kiện đó không đủ dùng để so thiết bị hoặc hứa tốc độ ứng dụng.

## 1. IOPS và bandwidth khác đơn vị hay khác cơ chế?

**IOPS**, I/O operations per second, đếm thao tác I/O hoàn tất mỗi giây theo công cụ/lớp. **Bandwidth** trong benchmark thường chỉ tốc độ byte truyền/hoàn tất; từ này cũng được dùng cho khả năng đường truyền danh nghĩa, nên cần ghi đang nói số đo hay khả năng link. **Block size**, kích thước một thao tác, quyết định số byte trên mỗi I/O; block trong fio không bắt buộc cùng kích thước block filesystem hoặc sector thiết bị.

Với kích thước cố định, gần đúng `byte/s = IOPS × byte mỗi thao tác` trong cùng ranh giới accounting. Ví dụ 1000 IOPS × 4 KiB ≈ 3,91 MiB/s, nhưng 1000 IOPS × 1 MiB ≈ 1000 MiB/s. Cùng IOPS chưa là cùng lượng dữ liệu hoặc cùng áp lực storage. **KiB/MiB** dùng 1024/1024² byte; **kB/MB** theo quy ước SI dùng 1000/1000² byte; **bit** là đơn vị nhỏ, 8 bit = 1 byte. 100 Mbit/s danh nghĩa tương ứng 12,5 MB/s trước overhead, không phải 100 MB/s.

**Sequential I/O**, tuần tự, đi qua các vị trí liên tiếp; **random I/O**, ngẫu nhiên, truy cập vị trí không tuần tự theo cách tạo mẫu của tool. **Read/write mix** là tỷ lệ đọc/ghi. Với ổ quay, vị trí/tìm kiếm có chi phí khác SSD; với SSD cũng không coi mọi pattern giống nhau vì cache, controller, garbage collection và parallelism. **Overhead** là phần chi phí/phần dữ liệu phụ ngoài mục tiêu đo, như giao thức mạng; ghi rõ byte tool đếm ở lớp nào.

Ví dụ kiểm chứng không cần benchmark: lấy IOPS và bandwidth fio cùng run, nhân IOPS với bs rồi đối chiếu đơn vị. Nếu khác đáng kể, xem block size có biến thiên, nhiều job, báo tổng/riêng và cách quy đổi; không suy tool sai trước khi đọc semantics.

## 2. Tăng queue depth có làm tất cả I/O nhanh hơn?

**Queue**, hàng đợi, giữ công việc chưa hoàn tất; **outstanding I/O** là yêu cầu đã phát mà chưa xong; **queue depth** là số yêu cầu outstanding ở ranh giới xét. **Concurrency** là mức công việc song song/cùng tồn tại, có thể từ nhiều job hoặc nhiều yêu cầu của một job. Tăng depth có thể giúp thiết bị làm song song và tăng throughput, nhưng cũng có thể tăng thời gian chờ/tail latency.

```text
Ứng dụng/fio jobs → yêu cầu đang nổi → filesystem/block layer
                                            → driver/queue thiết bị → completion
```

**Filesystem** là cấu trúc tổ chức file/dữ liệu; **block layer** là phần kernel tổ chức yêu cầu thiết bị khối; **kernel** là lõi quản lý tài nguyên; **driver** là mã giao tiếp thiết bị. **Completion** là mốc yêu cầu hoàn tất theo lớp; latency fio không tự là toàn thời gian một request HTTP hoặc bảo đảm dữ liệu đã bền sau mất điện. Queue ở nhiều lớp có thể có kích thước khác nhau, không lấy iodepth fio làm đúng số queue của SSD.

**I/O engine** là cơ chế fio dùng để phát yêu cầu. **Synchronous I/O**, đồng bộ theo kiểu gọi, thường đợi thao tác xong trước phát tiếp ở cùng job; engine `psync` dùng pread/pwrite. Với một job psync, đặt `iodepth=32` không tự tạo 32 thao tác song song. **Asynchronous I/O**, phát yêu cầu rồi nhận completion sau, có thể hỗ trợ nhiều outstanding; cần engine/hỗ trợ/config phù hợp và xem depth thực tế. Tên async cũng không hứa mọi đường filesystem/cache đều hoạt động như kỳ vọng.

Fio có histogram/phần “IO depths”: đọc tỷ lệ depth thực đạt được, không chỉ giá trị cấu hình. Thêm `numjobs` tạo nhiều job và có thể tăng tổng concurrency ngay cả mỗi job depth1; đó là biến khác cần ghi, không dùng để so “depth1 vs32” mà giấu số job. [Tài liệu fio](https://fio.readthedocs.io/en/latest/fio_doc.html) mô tả engine, depth và latency theo từng cơ chế.

## 3. Cache mode và durability làm thay đổi phép đo ra sao?

**Cache**, bộ nhớ đệm, giữ dữ liệu để tránh phải đọc/ghi lớp chậm hơn; **page cache** là bộ đệm nội dung file do kernel quản lý trong **RAM**, bộ nhớ làm việc. **Buffered I/O** dùng cache theo đường hỗ trợ; đọc file nhỏ nhiều lần có thể chủ yếu đọc RAM, không đo trực tiếp SSD. **Direct I/O** yêu cầu giảm/bỏ qua page cache cho dữ liệu theo hỗ trợ filesystem; fio `direct=1` dùng cơ chế đó. Cache thiết bị/controller/host VM vẫn có thể còn; direct trong guest không bảo đảm bỏ mọi cache host.

**Alignment**, căn chỉnh, là điều kiện địa chỉ vùng đệm, kích thước/vị trí I/O theo đơn vị được lớp dưới yêu cầu. Direct không được hỗ trợ hoặc sai alignment có thể lỗi EINVAL hoặc hành vi phụ thuộc filesystem; ghi lại lỗi và phạm vi. Không âm thầm đổi direct sang buffered rồi gọi là cùng phép đo.

**Durability**, độ bền, là cam kết dữ liệu còn sau loại sự cố được xét. `fsync` yêu cầu đồng bộ file theo bảo đảm filesystem/thiết bị; **end_fsync** trong fio thực hiện sync ở cuối giai đoạn job phù hợp, không làm mỗi write trở thành synchronous durability. `direct=1` khác `sync=1`/fsync policy; một benchmark direct throughput không tự cam kết giao dịch ứng dụng bền. Bài 23 đã tách flush ứng dụng, write kernel và fsync; khi thiết kế fio hãy ghi mức đồng bộ cùng cache mode.

**Warm cache** là điều kiện phần dữ liệu đã ở cache; **cold cache** là chưa có ở lớp xét. Không gọi run đầu trên file mới là “mọi cache cold” nếu VM/controller/thiết bị chưa được kiểm soát. Không dùng drop_caches trên host để ép cold: ảnh hưởng công việc khác và vẫn không xóa mọi lớp cache. Ghi chính xác điều biết, như “guest direct I/O, chưa kiểm soát cache host/thiết bị”.

## 4. Lab fio: file riêng, tải nhỏ và thời gian có giới hạn

### 4.1. Xác nhận đúng công cụ và vùng file

Cài **Flexible I/O Tester** (`fio`) từ distro trong VM nếu thiếu; có công cụ khác trùng tên fio, nên đọc `fio --version`, `fio --help` phải phù hợp I/O tester. **VM**, máy ảo, là máy tính được phần mềm tạo/quản lý; guest là hệ bên trong, host là máy/lớp bên ngoài. Kết quả guest đi qua đường VM, không ghi là raw hardware của host.

**Shell** là trình diễn giải lệnh; `mktemp -d` tạo thư mục mới riêng. Không thay filename bằng `/dev/...`; chỉ dùng file trong thư mục vừa tạo. Chuẩn bị ít nhất 512 MiB trống cho dataset256MiB và dư địa filesystem; `df` phản ánh filesystem, quota/giới hạn khác vẫn cần kiểm tra. **Mount** là gắn filesystem vào vị trí truy cập; `findmnt -T` xác định filesystem chứa đường dẫn.

```bash
command -v fio
fio --version
fio --help
mkdir -p "$HOME/linux-lab"
bench_dir=$(mktemp -d "$HOME/linux-lab/fio.XXXXXX")
printf 'Benchmark directory: %s\n' "$bench_dir"
df -h "$bench_dir"
findmnt -T "$bench_dir" -o TARGET,SOURCE,FSTYPE,OPTIONS
```

Dừng nếu công cụ sai/thiếu, mktemp lỗi, không đủ chỗ hoặc đích không phải VM lab đã chọn. Không chạy tiếp với biến rỗng; không force option để vượt cảnh báo. tmpfs là filesystem trong bộ nhớ (có thể dùng swap), không phù hợp để gọi kết quả là SSD throughput; overlay trong container cũng thêm lớp cần ghi.

### 4.2. Chuẩn bị file có dữ liệu, không chỉ truncate vùng trống

```bash
timeout 30s fio --name=prepare --filename="$bench_dir/data.bin" --size=256M \
    --rw=write --bs=1M --ioengine=psync --iodepth=1 --numjobs=1 \
    --direct=1 --end_fsync=1 --group_reporting
```

`rw=write` ghi tuần tự, `size=256M` là phạm vi file/job theo đơn vị fio, `bs=1M` mỗi thao tác khoảng1MiB, `psync`/depth1 một yêu cầu mỗi job, direct bỏ page cache dữ liệu theo hỗ trợ. `timeout 30s` là wrapper giới hạn thời gian thật, không để prepare chạy mãi; mã124 thường nghĩa đã dừng vì hết thời hạn. Chỉ tiếp tục nếu fio không có lỗi và prepare hoàn tất; file một phần không được dùng để tuyên bố phép read cùng dataset chuẩn bị đầy đủ.

Chuẩn bị ghi chính file lab, không chọn vùng nguồn thật. Không dùng truncate-only rồi đọc lỗ sparse để suy tốc độ ổ: **sparse file** có khoảng logic chưa cấp block thật và có thể trả zero mà không đọc như file dữ liệu đã ghi. Dataset256MiB là fixture học tool, không đại diện steady-state SSD; **steady state** là trạng thái đủ ổn định theo mục tiêu benchmark sau các giai đoạn khởi tạo/biến đổi. Thiết bị production còn có dung lượng dùng, nhiệt, firmware và workload khác.

### 4.3. Đọc ngẫu nhiên4KiB, depth1 trong tối đa10 giây

```bash
timeout 15s fio --name=read4k --filename="$bench_dir/data.bin" --size=256M \
    --rw=randread --bs=4k --ioengine=psync --iodepth=1 --numjobs=1 \
    --direct=1 --runtime=10 --time_based --group_reporting \
    --output="$bench_dir/read4k.txt"
cat "$bench_dir/read4k.txt"
```

`time_based` chạy pattern trong runtime thay vì chỉ một lượt size; wrapper15s chặn việc treo vượt phạm vi. Chỉ đọc file lab đã tạo. Fio output có thể dùng ms/us/ns, KiB/MiB hoặc MB, hãy đọc nhãn thực thay vì cố quy về một đơn vị không kiểm tra.

Ví dụ **minh họa**, không phải kết quả máy:

```text
read: IOPS=5000, BW=19.5MiB/s
clat (usec): ... avg=190 ...
clat percentiles (usec): 95.00th=[250], 99.00th=[500]
cpu: usr=2.0%, sys=5.0% ...
IO depths: 1=100.0%, 2=0.0%, ...
```

`IOPS/BW` là thao tác/byte đọc; 5000×4KiB gần19,5MiB/s. **slat**, submission latency, là thời gian phát theo engine; **clat**, completion latency, từ mốc phát/đợi completion theo engine; **lat** là total latency theo fio. Với synchronous engine, cách ghi slat/clat có thể khác engine async; đọc manual và nhãn, không hứa clat chỉ là “thời gian SSD”. **Percentile**, phân vị, p95/p99 biểu diễn phần đuôi tập I/O được tool ghi; avg không thay đuôi. **usr/sys** là CPU user/kernel của job theo output, không tổng hostCPU. IO depths xác nhận pattern depth1 thật.

Ghi IOPS/BW, clat avg/p95/p99 nếu có, unit, CPU, depth thực, error/status, file size, filesystem/VM/cache mode và duration. Nếu direct lỗi, giữ stderr/output và kết luận chưa đo được điều kiện direct đó. Chọn filesystem VM lab hỗ trợ rồi lặp với điều kiện ghi lại; không chữa bằng đổi direct=0 mà giữ nhãn cũ.

Nhánh buffered read là phép thử riêng: đổi `direct=0`, tên/output riêng và ghi warm/cold biết được; không cần thực hiện nếu mục tiêu chỉ học direct. File nhỏ trong RAM có thể rất nhanh mà không đại diện SSD. Không tăng duration, workers hay dataset để chạy tới khi host chậm.

### 4.4. Dọn đúng fixture sau khi giữ số liệu

```bash
rm -- "$bench_dir/data.bin"
```

Giữ read4k.txt và cấu hình trong báo cáo. Khi không cần output, xóa đúng read4k.txt rồi `rmdir "$bench_dir"`; không `rm -rf` thư mục không xác minh. Đừng xóa file khi fio vẫn chạy; wrapper/lệnh phải kết thúc trước dọn. Không còn dataset không có nghĩa cache/thiết bị đã quay về mọi trạng thái trước benchmark.

## 5. TCP throughput bị giới hạn bởi điều gì ngoài link speed?

**Network link** là đường kết nối giữa các điểm, có tốc độ danh nghĩa; **TCP** là giao thức truyền luồng byte tin cậy với điều khiển gửi/nhận. **RTT**, round-trip time, là thời gian tín hiệu đi/về theo phép đo; **loss** là mất dữ liệu/gói trong đường xét. **Congestion window (cwnd)** là giới hạn dữ liệu đang nổi mà phía gửi cho phép theo điều khiển tắc nghẽn; **receive window** là giới hạn phía nhận quảng bá theo khả năng nhận. CPU, buffer hai đầu, mức song song, RTT/loss và đường đi cùng ảnh hưởng tốc độ.

**Bandwidth-delay product (BDP)** là lượng dữ liệu tương ứng tốc độ đường truyền × thời gian khứ hồi. Ví dụ100Mbit/s×0,020s =2Mbit =250kB gần244KiB trước overhead. Để lấp đầy đường có RTT đó, cần đủ dữ liệu đang trên đường theo các điều kiện protocol; BDP không chỉ là “đổi một sysctl bằng con số đó rồi chắc đạt tốc độ”. Congestion/receive window và ứng dụng phải cung cấp/nhận đủ dữ liệu, bottleneck thật có thể nằm nơi khác.

```text
Ứng dụng gửi → buffer/socket TCP → NIC/đường truyền → TCP nhận → ứng dụng nhận
                    ↑                 │
               ACK/điều khiển ←───────┘ theo đường về
```

**Socket** là điểm giao tiếp hệ điều hành cung cấp; **NIC**, network interface card, là thiết bị giao tiếp mạng hoặc lớp interface ảo; **ACK** là xác nhận dữ liệu theo giao thức. Đường về cũng tham gia RTT, không chỉ tốc độ một chiều. Mũi tên dữ liệu đi qua buffer hai đầu; iperf3 tạo workload truyền dữ liệu, HTTP/database còn có xử lý request, lưu trữ và logic nên có latency/throughput khác.

**Retransmission** là gửi lại dữ liệu; có thể liên quan mất, congestion hoặc các điều kiện khác như reordering/timeout. **Reordering** là đến khác thứ tự, **packet capture** là ghi gói tại vị trí quan sát. Capture một phía thấy retransmit chưa đủ chỉ ra gói rơi ở switch nào hoặc chiều nào; phải kết hợp endpoint counters/đường đi. Không quy mọi retransmission là “cáp hỏng”.

**MTU**, maximum transmission unit, là cỡ gói lớp mạng có thể mang trên một link theo cấu hình; **Path MTU Discovery**, tìm MTU trên đường, dùng phản hồi mạng/cơ chế protocol để điều chỉnh. Nếu thông báo cần thiết bị cản, request nhỏ có thể chạy nhưng truyền lớn treo hoặc chậm. Điều đó là giả thuyết cần bằng chứng route/packet/counter, không tự tắt firewall hoặc tăng MTU toàn host. Xem [TCP trong kernel documentation](https://docs.kernel.org/networking/ip-sysctl.html) và [TCP man page](https://man7.org/linux/man-pages/man7/tcp.7.html).

## 6. Lab iperf3 hai VM: đo hai chiều có ngân sách

### 6.1. Chuẩn bị phạm vi, địa chỉ và công cụ

Chỉ dùng hai VM thuộc lab của bạn, nối mạng thử nghiệm riêng; không gửi benchmark tới Internet/máy người khác. Cài iperf3 từ distro nếu cần, kiểm tra `iperf3 --version`; iperf2 và iperf3 không mặc định tương thích. **IP address** là địa chỉ lớp mạng của interface; `ip -brief address` liệt kê interface/địa chỉ. Chọn địa chỉ VM server mà client lab đi tới được, không lấy loopback của server để client VM khác dùng.

Mặc định iperf3 dùng TCP port5201; **port** là số nhận diện điểm nhận trong máy. Chỉ cho phép cổng thử từ client/mạng lab theo chính sách VM đã học ở bài25. Đọc `ss -ltn 'sport = :5201'` trước để xem đã có chương trình dùng cổng hay không; không dừng chương trình của người khác để lấy cổng. `ss` là công cụ quan sát socket, `-l/-t/-n` chọn listening/TCP/numeric.

Phép thử gốc một luồng10s có thể cố dùng tối đa đường truyền. Bài này giới hạn mặc định10Mbit/s để học output; tăng tốc chỉ trong mạng lab riêng có ngân sách tải, ghi lại chính xác thay đổi. `-b` của iperf3 có thể đặt target bitrate cho TCP theo phiên bản hỗ trợ, khác danh nghĩa link; một kết quả gần10Mbit/s trong run capped không chứng minh link tối đa10Mbit/s.

### 6.2. Server một lần và client có thời hạn

Trên server VM, thay địa chỉ thật đã xác nhận:

```bash
server_ip='THAY_IP_VM_SERVER'
timeout 30s iperf3 -s -1 -B "$server_ip"
```

`-s` server, `-1` xử lý một client rồi kết thúc, `-B` bind đúng địa chỉ interface của VM; wrapper30s dừng nếu không có client/kết nối bị treo. Server không phải system service tự sống lại. Địa chỉ placeholder chưa thay sẽ lỗi, không tiếp tục cho là test thành công.

Trong30s ấy, ở client VM:

```bash
server_ip='THAY_CUNG_IP_VM_SERVER'
timeout 15s iperf3 -c "$server_ip" -t 10 -b 10M --get-server-output
```

`-c` kết nối server, `-t 10` thời gian truyền, `-b10M` target gửi, `--get-server-output` lấy báo cáo phía server nếu hỗ trợ. Không dùng `-P` tăng parallelism trong run cơ bản. Với công cụ không hỗ trợ option đã chọn, ghi lỗi và đọc manual bản cài; không âm thầm chạy uncapped trên mạng đang dùng chung.

**Sender** là bên gửi dữ liệu thử, **receiver** là bên nhận; mặc định client gửi. Output thường có interval/transfer/bitrate, sender/receiver summary và Retr/Cwnd theo OS/protocol hỗ trợ. Ví dụ minh họa10s, transfer khoảng12MB, bitrate gần10Mbit/s không phải số cố định do pacing/overhead. **Pacing** là cách chia thời gian phát dữ liệu để hướng tới target rate; đo thực vẫn phải đọc bitrate/result.

Nếu timeout kết thúc, log có lỗi hoặc summary thiếu, ghi run không hoàn tất, không dùng file đó làm bằng chứng throughput sạch. Server `-1` có thể đã nhận một kết nối hỏng rồi kết thúc; phải khởi động lại cho phép thử tiếp.

### 6.3. Đo chiều ngược và quan sát hai đầu

Chạy lại server cùng lệnh, rồi client:

```bash
timeout 15s iperf3 -c "$server_ip" -t 10 -b 10M -R --get-server-output
```

`-R` đảo hướng dữ liệu để server gửi, client nhận; điều khiển vẫn do client thiết lập. Ghi run reverse riêng, không gộp như cả hai chiều được đo đồng thời. Sự khác nhau có thể do tài nguyên/đường đi/ảo hóa hai đầu, cần thu bằng chứng.

Trong thời gian thử ở mỗi VM, đọc:

```bash
ss -tin
ip -s link
vmstat 1 5
```

`ss -i` có thông tin TCP như rtt/cwnd/retrans khi kernel/tool cung cấp, `-t/-n` TCP/numeric. `ip -s link` cho byte/packet/errors/dropped theo interface, là counter tích lũy; lấy trước/sau và đúng interface để tính delta. **Packet** là đơn vị dữ liệu mạng; số drop interface và retrans TCP không là cùng counter và không bắt buộc khớp một-một. vmstat CPU/steal giúp xét hai đầu có nghẽn tài nguyên. `ss -tin` có cả socket khác, xác định connection port5201/địa chỉ lab trước đọc.

**Loopback-only fallback** nếu không có hai VM: có thể thử server `127.0.0.1` với cùng rate/duration để học output nhưng ghi rõ đo ngăn xếp TCP cục bộ, không đo link/NIC hay mạng giữa máy. Không gọi kết quả loopback là tốc độ card mạng vật lý.

## 7. Nối kết quả benchmark với vấn đề ứng dụng thế nào?

| Quan sát | Giả thuyết hợp lý để kiểm tra tiếp | Điều chưa được chứng minh |
|---|---|---|
| Fio randread tốt, HTTP chậm | HTTP khác pattern/cached data/khóa/upstream hoặc CPU | SSD không thể là yếu tố của workload khác |
| Depth tăng làm BW tăng, p99 tăng | Thiết bị khai thác song song nhưng queue wait tăng | Tăng depth là cải thiện mọi mục tiêu |
| Buffered nhanh hơn direct file nhỏ | Page cache/RAM phục vụ phần việc | Phần cứng SSD tăng tốc tương ứng |
| Iperf capped đạt10Mbit/s | Đường thử phục vụ được target này ở điều kiện đó | Max throughput của link hoặc HTTP/database |
| Iperf một chiều khác reverse | Bất đối xứng endpoint/đường/VM cần đọc CPU/counter | Chỉ một kết quả xác định switch hỏng |
| Request nhỏ tốt, truyền lớn treo | PMTU/loss/window/app có thể khác | Chắc chắn MTU sai và cần đổi host ngay |

**Upstream** là dịch vụ phía sau mà proxy gọi; **proxy** là chương trình chuyển request; **p99/tail latency** là phần đuôi độ trễ theo phân vị. **Error rate** là tỷ lệ lỗi trong phạm vi/định nghĩa yêu cầu. Trước thay đổi worker/depth/connection, giữ mục tiêu ứng dụng: nhiều connection có thể tăng tổng throughput nhưng tăng tranh chấp và tail. Client benchmark cũng có thể là bottleneck, xem CPU/network cả hai đầu và engine/depth, không chỉ server.

Một run nhỏ không đại diện capacity production; **capacity** là khả năng phục vụ workload dưới yêu cầu latency/errors đã định. Nhiệt, VM host đang có tải, bộ dữ liệu/cache và giới hạn nhóm có thể thay kết quả. Giữ output thô, phiên bản/config, đơn vị và mốc trước/sau; đổi một biến một lần như bài31.

## 8. Tự kiểm tra và phần nộp

1. 1000IOPS ở4KiB và1MiB có cùng BW không? **Tiêu chí:** nhân đúng byte, quy đổi đơn vị, ranh giới tương ứng.
2. psync một job đặt depth32 có chắc32I/O đang nổi? **Tiêu chí:** không; engine đồng bộ và depth thực output quyết định.
3. Direct trong guest có chắc đo không cache? **Tiêu chí:** chỉ đường cache đã yêu cầu trong guest; host/device còn lớp khác.
4. `end_fsync=1` có bảo đảm từng write durable trước trả? **Tiêu chí:** không, sync cuối khác sync mỗi thao tác/giao dịch.
5. Iperf capped10Mbit/s đạt target: link tối đa10Mbit/s? **Tiêu chí:** không, target là điều kiện do mình đặt.
6. BDP100Mbit/s, RTT20ms khoảng bao nhiêu byte? **Tiêu chí:** 250000byte trước overhead, không250MB.
7. `-R` đổi hướng nào? **Tiêu chí:** server gửi dữ liệu, client nhận, vẫn client thiết lập thử.
8. Fio file256MiB trực tiếp10s có chứng minh steady-state SSD production? **Tiêu chí:** không; fixture/duration/VM/cache/workload khác.

Nộp bảng workload gồm dataset, bs, read/write pattern, engine, job/depth cấu hình và thực tế, cache/sync policy, duration, VM/host/filesystem, unit và error/status; bảng fio IOPS/BW/clat/CPU; iperf target/direction/địa chỉ lab/counter hai đầu nếu đã thử. Nếu công cụ chưa có hoặc thiếu VM, nêu chưa chạy phần đó và cách đọc minh họa, không điền số giả. Tự nhắc: định nghĩa I/O và byte → ghi đường cache/queue/đồng bộ → chọn fixture có giới hạn → đọc output theo lớp → nối với workload ứng dụng. Bài34 dùng tracing để tìm phần cơ chế còn chưa rõ.

## Nguồn và phạm vi phiên bản

- [Fio documentation](https://fio.readthedocs.io/en/latest/fio_doc.html): engine, depth, direct, runtime/sync và latency accounting.
- [Iperf3 invoking](https://software.es.net/iperf/invoking.html): client/server/reverse, target bitrate và output; manual cài cùng chương trình là mốc option của phiên bản thực.
- [ss](https://man7.org/linux/man-pages/man8/ss.8.html), [TCP](https://man7.org/linux/man-pages/man7/tcp.7.html), [kernel networking controls](https://docs.kernel.org/networking/ip-sysctl.html): socket/window/MTU và ranh giới kernel. Nguồn sysctl để hiểu cơ chế, bài không yêu cầu chỉnh sysctl.
- [fsync](https://man7.org/linux/man-pages/man2/fsync.2.html), [open/O_DIRECT](https://man7.org/linux/man-pages/man2/open.2.html): cache và durability là mục tiêu khác nhau.

Ghi `fio --version`, `iperf3 --version`, `uname -r`, tool/help địa phương. Option, engine, protocol counters, pacing và filesystem hỗ trợ khác theo môi trường; output minh họa không phải cam kết tốc độ.
