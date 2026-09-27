# Bài 31 — Phương pháp tìm bottleneck

[Mục lục](../README.md) · [← Bài 30](30-backup-recovery.md) · [Bài 32 →](32-cpu-memory-performance.md)

## Mục tiêu: biến “máy chậm” thành câu hỏi có thể kiểm chứng

Một trang HTTP thỉnh thoảng trả lời chậm. CPU trung bình chỉ 30%, nhưng một người đề nghị mua thêm CPU, người khác đề nghị tăng timeout. Trước khi thay đổi, bạn cần biết người dùng chờ ở đâu, tài nguyên nào giới hạn và phép thử nào có thể bác bỏ suy đoán. Bài này cung cấp quy trình đó, dùng dịch vụ lab ở bài 15/25 và các phép đo giới hạn thời gian. Cần nền bài 17, 19, 23–25, 29; không cần cố làm cả máy quá tải.

Sau bài, bạn cần mô tả triệu chứng bằng số liệu và phạm vi, lập baseline có điều kiện tương đương, phân biệt utilization/saturation/errors, hiểu hàng đợi và Little’s Law, đọc bộ quan sát đầu tiên, đo 20 request và viết kết luận có giới hạn. Dữ liệu thô phải được giữ; không sửa kết quả để khớp giả thuyết.

## 1. Điều gì chậm, đối với ai, ở khoảng thời gian nào?

**Performance**, hiệu năng, là khả năng hoàn thành công việc theo những tiêu chí đã chọn, chẳng hạn thời gian phản hồi hoặc số đơn xử lý mỗi giây. **Symptom**, triệu chứng, là hiện tượng quan sát được như “request chậm”; **cause**, nguyên nhân, là cơ chế tạo hiện tượng như chờ một khóa chung. **Bottleneck**, nút thắt, là phần đang giới hạn mục tiêu của một workload trong điều kiện cụ thể. Nó có thể đổi khi tải/đường dữ liệu thay đổi.

**Workload** là mẫu công việc được đưa vào hệ: thao tác nào, dữ liệu lớn bao nhiêu, tốc độ đến, số việc song song. **Endpoint** là đích/chức năng API cụ thể, như `GET /orders`; **job** là một lần chạy tác vụ, như nhập một file; **request** là yêu cầu mà client gửi để server xử lý. **Client** là bên gửi, **server** là bên phục vụ. **HTTP** là giao thức yêu cầu/phản hồi; trong lab curl là client, server cục bộ trả một file. Trang tĩnh nhỏ và truy vấn database phức tạp là hai workload khác nhau dù cùng HTTP.

**Latency**, độ trễ, là thời gian một thao tác theo ranh giới đo; **throughput**, thông lượng, là lượng công việc hoàn tất mỗi đơn vị thời gian. **Concurrency**, mức đồng thời, là số việc cùng tồn tại/đang được thực hiện trong phạm vi xét; nó không đồng nghĩa request đến mỗi giây. **Error rate**, tỷ lệ lỗi, cần mẫu số và định nghĩa lỗi: status HTTP khác mong đợi, timeout hoặc nội dung sai có thể là các lớp khác nhau.

Trước đo, viết một câu cụ thể: “20 yêu cầu tuần tự lấy `/` từ VM lab, mỗi yêu cầu tối đa 2 giây, mong HTTP 200 và nội dung mẫu; đo tổng thời gian phía curl.” Câu đó chưa mô phỏng cao điểm production nhưng đủ tạo phép thử lặp lại. **Production** là môi trường phục vụ thực; lab là môi trường thử. Không gửi tải thử tới endpoint có tác dụng ghi dữ liệu hay hệ ngoài phạm vi của bạn.

**Baseline**, trạng thái/số đo mốc, phải ghi cùng phiên bản, cấu hình, workload, dữ liệu và phạm vi tài nguyên. **Dataset** là bộ dữ liệu đầu vào, ở đây một file nhỏ. So máy production giờ cao điểm với VM rảnh không cô lập nguyên nhân. Ghi điều vừa đổi (release, số worker, cấu hình, cache) nhưng “xảy ra sau thay đổi” chưa đủ chứng minh thay đổi là nguyên nhân.

## 2. CPU bận có phải nghĩa là nghẽn CPU?

**CPU** là bộ xử lý thực thi chỉ thị; **RAM** là bộ nhớ làm việc; **I/O** là trao đổi dữ liệu vào/ra như đọc ổ hoặc gửi mạng. **Process**, tiến trình, là một lần chạy chương trình có bộ nhớ/tài nguyên; **thread**, luồng thực thi, là một dòng công việc được lập lịch trong process. **Kernel** là phần lõi quản lý những tài nguyên ấy. Một thread dùng CPU, đợi CPU, đợi dữ liệu và đợi khóa là những tình trạng khác nhau.

**Utilization**, mức sử dụng, mô tả tài nguyên bận trong phạm vi và cách công cụ tính. **Saturation**, mức bị dồn/chờ vì tài nguyên không phục vụ kịp, nói về công việc phải đợi. **Errors**, lỗi, là dấu hiệu thao tác không hoàn tất đúng. Ba góc này giúp kiểm tra tài nguyên thay vì chỉ nhìn một phần trăm.

| Tài nguyên | Ví dụ utilization | Ví dụ saturation | Ví dụ errors |
|---|---|---|---|
| CPU | Thời gian thực thi | Thread runnable phải đợi | Không có một “CPU error counter” chung thay lỗi ứng dụng; xem giới hạn/thất bại thực tế |
| Bộ nhớ | Phần resident/cấp thực | Thời gian reclaim hoặc thiếu trang | OOM, lỗi cấp phát theo phạm vi |
| Storage | Byte/thao tác hoàn tất, thời gian có I/O | Request đợi ở queue | Lỗi đọc/ghi, timeout |
| Mạng | Byte gửi/nhận | Hàng đợi/giới hạn đường truyền | Drop/retransmission theo lớp và công cụ |

**Runnable** nghĩa là có thể chạy nhưng có thể đang đợi scheduler, bộ chọn thread chạy trên CPU. **Reclaim** là kernel tìm/thu hồi vùng nhớ có thể tái dùng; **OOM**, out of memory, là tình huống thiếu bộ nhớ theo giới hạn khiến cơ chế xử lý thiếu nhớ được kích hoạt. **Queue** là hàng đợi công việc, **drop** là gói/bản dữ liệu bị bỏ, **retransmission** là gửi lại dữ liệu theo giao thức. Bảng gợi ý phép nhìn, không biến mọi counter thành cùng ý nghĩa trên mọi thiết bị.

CPU một thread bận gần 100% nhưng không có nhiều việc đợi có thể là dùng hiệu quả. Ngược lại tổng CPU thấp vẫn chậm nếu một thread quan trọng bị giới hạn một core, bị quota hoặc đợi khóa. **Mutex**, khóa loại trừ, chỉ cho một bên vào đoạn dùng chung mỗi lần; nhiều thread ngủ chờ mutex không làm CPU toàn máy bận. Phải nối số đo toàn máy với thread/đường request, không suy ra từ CPU thấp rằng phần mềm không có nút thắt.

## 3. Vì sao tải chỉ tăng một chút mà đuôi độ trễ tăng nhiều?

**Queueing**, xếp hàng chờ, xuất hiện khi công việc đến nhanh hơn khả năng phục vụ tức thời. Khi tải trung bình tiến gần khả năng phục vụ, một đợt đến dồn (**burst**) hoặc thao tác phục vụ chậm có thể tạo hàng dài chưa kịp thoát. Không cần hệ lỗi để độ trễ tăng.

```text
Client gửi yêu cầu → hàng đợi → worker xử lý → phản hồi
                       │           │
                    chờ lượt    thời gian phục vụ
       latency theo ranh giới này = chờ + phục vụ (+ phần đường đi đã chọn)
```

**Worker** là đơn vị xử lý công việc, có thể thread/process tùy ứng dụng. Mũi tên là đường request; latency phía client có thể thêm kết nối/mạng và đọc phản hồi. Đừng so latency phía client với thời gian xử lý riêng ở server rồi gọi phần chênh là CPU wait khi chưa đo.

**Little’s Law** liên hệ các đại lượng trung bình: `L = λ × W`. `L` là số công việc trung bình trong hệ đã chọn, `λ` là tốc độ hoàn tất trung bình cùng ranh giới đó, `W` là thời gian trung bình ở trong hệ. Để áp dụng cho trạng thái ổn định phải có các mốc/đơn vị tương thích và không tăng backlog mãi. Ví dụ minh họa throughput 100 request/s, thời gian trong hệ trung bình 0,2 giây cho `L≈20` request trung bình trong hệ. Nếu W chỉ là thời gian chờ queue thì L tương ứng cũng chỉ là số chờ queue, không phải tất cả request.

Công thức không thay **percentile**, phân vị. p95 là mốc mà khoảng 95% mẫu trong tập không vượt quá theo cách tính được chọn; **tail latency**, độ trễ phần đuôi, quan tâm các request chậm như p95/p99 thay vì chỉ trung bình. Little’s Law dùng trung bình, không thay W bằng p99 rồi diễn giải L là queue trung bình. Nó cũng không dự báo chính xác một burst hoặc mọi hệ không ổn định. [Mô hình queueing trong tài liệu AWS Builders’ Library](https://aws.amazon.com/builders-library/using-load-shedding-to-avoid-overload/) mô tả mối quan hệ tải, chờ và giảm tải trong vận hành.

**Retry**, thử lại yêu cầu, nếu không kiểm soát có thể tăng tải đúng lúc hệ yếu: 100 yêu cầu gốc cộng các lần retry tạo nhiều công việc hơn server chịu nổi. **Timeout** là giới hạn thời gian chờ; tăng nó có thể giảm lỗi hiển thị nhưng giữ nhiều request tồn tại lâu hơn, tăng tài nguyên/hàng đợi. Cần ngân sách retry và xử lý tải, không coi thêm timeout là tối ưu đã chứng minh.

## 4. Bộ quan sát đầu tiên cho biết gì và chưa cho biết gì?

**Metric** là đại lượng đo có định nghĩa, đơn vị và phạm vi; **sample** là mẫu tại thời điểm/khoảng đo; **time series** là chuỗi mẫu theo thời gian. Các lệnh dưới chỉ đọc. Công cụ iostat/pidstat/sar thuộc sysstat; nếu thiếu, cài trong VM theo distro đã học, không cần thay cấu hình host để làm bài.

```bash
uptime
vmstat 1 5
iostat -xz 1 5
pidstat -u -r -d 1 5
ss -s
cat /proc/pressure/cpu
cat /proc/pressure/memory
cat /proc/pressure/io
```

Chạy một bộ mẫu ngắn, ghi timestamp bối cảnh bằng `date -u`; UTC là giờ phối hợp chung giúp đối chiếu log. Các lệnh chạy lần lượt không cùng một cửa sổ: khi cần tương quan, dùng hai terminal trong cùng khoảng thử và ghi mốc, không coi mẫu cách nhau 30 giây là đồng thời. **Shell** là chương trình đọc câu lệnh như Bash; **`/proc`** là cây file ảo kernel xuất trạng thái, không phải file log trên ổ.

| Lệnh/trường | Cách đọc quan trọng | Giới hạn |
|---|---|---|
| uptime, load 1/5/15 phút | Load average là số task runnable và một số task chờ không ngắt được, được làm trơn theo thời gian | Không phải CPU percent; cần số CPU khả dụng và loại chờ |
| vmstat `r`, `b`, `us/sy/id/wa` | r gồm đang chạy/đợi CPU, b là blocked I/O theo công cụ; các cột CPU là accounting | Dòng đầu nhiều tốc độ là trung bình từ boot; process/memory là ảnh tức thời, các dòng sau là khoảng mẫu |
| iostat `r/s,w/s`, `r_await/w_await`, `aqu-sz`, `%util` | Số thao tác/s, thời gian hoàn tất gồm chờ, queue trung bình và thời gian thiết bị có I/O | Tên trường/đơn vị tùy bản; không suy “100% util = hết throughput” cho NVMe/thiết bị song song |
| pidstat `-u/-r/-d` | CPU, fault/residency và I/O theo process trong mẫu | I/O process không luôn bằng block vật lý trong cùng giây vì cache/writeback |
| ss `-s` | Tóm tắt socket/trạng thái kết nối | Không đo latency HTTP hay chỉ ra upstream chậm nào |
| PSI `some/full`, `avg...`, `total` | Thời gian công việc bị đình trệ vì tài nguyên | Không tự chỉ ra request hoặc khóa nào gây chờ |

**Socket** là điểm giao tiếp chương trình, gồm kết nối mạng; **upstream** là dịch vụ phía sau mà proxy gọi tiếp; **proxy** là bên nhận rồi chuyển yêu cầu đến dịch vụ khác. **Fault** là sự kiện kernel cần xử lý ánh xạ/trang bộ nhớ, không đồng nghĩa lỗi chương trình. **Residency** là phần vùng nhớ hiện có trong RAM. **Writeback** đẩy dữ liệu cache cần ghi xuống storage sau, nên cách quy thuộc I/O cần đọc manual. Bài 32/33 sẽ giải nghĩa các trường sâu hơn.

**PSI**, Pressure Stall Information, đo thời gian task bị đình trệ vì CPU, memory hoặc I/O. `some` là có ít nhất một phần công việc bị stall; `full` của memory/I/O nói mọi task không idle trong phạm vi đều stall đồng thời theo cơ chế PSI. `avg10/60/300` là xu hướng phần trăm cửa sổ tương ứng; `total` là thời gian tích lũy microsecond, không phải phần trăm. CPU full ở mức toàn hệ thống không có cùng ý nghĩa memory full và được báo 0 để tương thích trong các kernel áp dụng; đừng lấy nó làm “CPU không pressure”. File PSI thiếu có thể do kernel/config/môi trường, không chứng minh tài nguyên luôn đủ. Xem [PSI](https://docs.kernel.org/accounting/psi.html).

`iostat` báo đầu tiên thường chứa trung bình từ boot trừ khi dùng option bỏ nó như `-y` khi phiên bản hỗ trợ. `pidstat` có interval thì đo interval; không áp quy tắc “tất cả dòng đầu mọi tool đều từ boot”. Đọc [vmstat](https://man7.org/linux/man-pages/man8/vmstat.8.html), [iostat](https://man7.org/linux/man-pages/man1/iostat.1.html), [pidstat](https://man7.org/linux/man-pages/man1/pidstat.1.html) để kiểm tra semantics bản cài.

## 5. Lab: giữ dữ liệu thô và so hai điều kiện có giới hạn

### 5.1. Định nghĩa request và kiểm tra dịch vụ trước tải

Dùng proxy lab bài 25 hoặc HTTP lab bài 15 đã chạy và endpoint chỉ đọc. **Loopback** là địa chỉ quay về chính môi trường mạng hiện tại, `127.0.0.1`; VM/container có loopback riêng. Không mở server khác ở cổng đang dùng để ép ví dụ. URL mẫu dưới là server bài 15; đổi thành đúng URL proxy nếu thử proxy và ghi lại thay đổi đó.

```bash
perf_lab=$(mktemp -d "${TMPDIR:-/tmp}/linux-perf.XXXXXX")
perf_url='http://127.0.0.1:8080/'
curl --noproxy '*' --max-time 2 --fail "$perf_url"
```

`mktemp` tạo thư mục riêng, `--noproxy '*'` bỏ proxy từ môi trường cho đường lab này, `--max-time` giới hạn cả thao tác curl. Đọc nội dung đúng trước đi tiếp; HTTP 200 nhưng file sai chưa là baseline hợp lệ. Nếu dịch vụ chưa có, thực hiện lab service trước hoặc dùng HTTP server tạm trên loopback trong VM, không gọi Internet để thay fixture. **Fixture** là dữ liệu/trạng thái nhỏ được chuẩn bị cho bài thử.

Lưu script `sample.sh` trong `$perf_lab` với nội dung sau:

```bash
#!/usr/bin/env bash
set -u
if (( $# != 2 )); then
    printf 'Usage: %s URL OUTPUT\n' "$0" >&2
    exit 2
fi
url=$1
output=$2
printf 'utc\thttp_code\tseconds\tcurl_status\n' > "$output" || exit 1
for ((n=1; n<=20; n++)); do
    stamp=$(date -u +%Y-%m-%dT%H:%M:%SZ) || exit 1
    if metrics=$(curl --noproxy '*' --silent --show-error --max-time 2 \
        --output /dev/null --write-out '%{http_code}\t%{time_total}' "$url"); then
        status=0
    else
        status=$?
    fi
    printf '%s\t%s\t%s\n' "$stamp" "$metrics" "$status" >> "$output" || exit 1
    sleep 0.1
done
```

`--write-out` in trường đo, `%{time_total}` là tổng thời gian curl theo giao diện công cụ; `--output /dev/null` bỏ body sau khi bước kiểm tra nội dung riêng đã làm. Không dùng `--fail` ở vòng đo để giữ riêng status HTTP và status curl: HTTP 500 có thể có `curl_status=0`, vì trao đổi HTTP hoàn tất nhưng ứng dụng báo lỗi. `http_code=000` thường là chưa nhận response HTTP phù hợp, phải xem status/stderr. Tab phân cột (**TSV**, dữ liệu phân cách bằng tab); timestamp theo giây có thể trùng giữa các request và không dùng để đo latency, vì curl đã đo thời gian thao tác.

```bash
bash -n "$perf_lab/sample.sh"
bash "$perf_lab/sample.sh" "$perf_url" "$perf_lab/baseline.tsv"
cat "$perf_lab/baseline.tsv"
```

`bash -n` chỉ kiểm tra cú pháp. Dòng minh họa `2026-01-01T00:00:00Z  200  0.004200  0` nghĩa phản hồi HTTP 200, khoảng 4,2 ms, curl thành công; số thật phụ thuộc máy. Giữ lỗi và mọi mẫu, không bỏ mẫu chậm hay HTTP lỗi để làm trung bình đẹp.

### 5.2. Thêm một process tính toán, không làm cả máy nghẽn

Chỉ trong VM lab, khi một process CPU chạy 8 giây không vượt ngân sách thử; không tạo N worker theo số CPU. `timeout` giới hạn thời gian lệnh, Python vòng lặp là **CPU-bound**, công việc chủ yếu cần CPU:

```bash
timeout 8s python3 -c 'while True: pass' &
load_wrapper=$!
bash "$perf_lab/sample.sh" "$perf_url" "$perf_lab/with_cpu.tsv"
if wait "$load_wrapper"; then
    load_status=0
else
    load_status=$?
fi
printf 'CPU wrapper status=%s\n' "$load_status"
```

`&` chạy nền, `$!` là PID process shell vừa tạo, ở đây wrapper timeout chứ không chắc Python con. Mã `124` thông thường là timeout đã hết thời hạn, không phải Python lab tự hỏng. Ctrl+C/dừng thử nếu VM không còn đáp ứng; không thay quota hoặc affinity của host để cố tạo bottleneck. Cùng lúc có thể ghi `vmstat 1 5` và PSI trên terminal khác.

20 request tuần tự mỗi request có thể timeout 2 giây, nên tổng vòng có thể dài hơn 8 giây. Cột with_cpu chỉ nói một process tải được khởi động lúc đầu; xác định cửa sổ giao nhau trước quy kết mọi dòng chịu tải. Với server phản hồi nhanh, vòng khoảng 2 giây và hầu hết mẫu nằm trong 8 giây. Nếu muốn thiết kế khác, ghi duration/mốc tải đúng thay vì kéo dài vô hạn. Tải một core trên máy nhiều core có thể không ảnh hưởng file HTTP nhỏ; đó là kết quả hợp lệ.

### 5.3. Tổng hợp vừa đủ, không hứa p99 từ 20 mẫu

Dùng Python đọc mỗi file TSV: đếm tổng mẫu, status curl khác 0, HTTP khác 200, tính min/median/max cho mẫu thành công và lưu lại phép lọc. **Median**, trung vị, chia mẫu thành hai nửa theo thứ tự. Với 20 mẫu, p99 bị chi phối bởi một vài mẫu cực trị và cách nội suy, chưa đủ mô tả ổn định đuôi production. Không lấy trung bình các p99 từ nhiều nhóm để gọi là p99 chung.

Đoạn sau đọc đủ mẫu và chỉ tính latency của HTTP200 + curl status0; số mẫu loại vẫn được báo riêng:

```bash
python3 - "$perf_lab/baseline.tsv" "$perf_lab/with_cpu.tsv" <<'PY'
import csv
import statistics
import sys

for path in sys.argv[1:]:
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f, delimiter="\t"))
    curl_errors = sum(int(r["curl_status"]) != 0 for r in rows)
    http_non200 = sum(r["http_code"] != "200" for r in rows)
    times = [float(r["seconds"]) for r in rows
             if int(r["curl_status"]) == 0 and r["http_code"] == "200"]
    print(path, "samples=", len(rows), "curl_errors=", curl_errors,
          "http_non200=", http_non200, "accepted=", len(times))
    if times:
        print("seconds min=%.6f median=%.6f max=%.6f" %
              (min(times), statistics.median(times), max(times)))
    else:
        print("no successful sample; inspect raw TSV and stderr")
PY
```

`curl_errors` và `http_non200` có thể cùng đếm một request, không cộng hai số như tổng số request lỗi độc nhất. Các giá trị seconds chỉ thuộc mẫu được chọn, lỗi/timeout vẫn còn trong TSV để đánh giá riêng; không gọi median này là median mọi trải nghiệm người dùng. Nếu TSV thiếu/sai trường, Python báo lỗi để bạn kiểm tra bước thu thập, không tự điền mẫu giả.

Một báo cáo nhỏ nên có bảng baseline/with_cpu với số request, số lỗi, median/max và phạm vi thời gian; dữ liệu minh họa không được ghi thành số đo thật. Đổi duy nhất tải CPU ở phép thử này, giữ URL/dataset/client mode. Nếu có đổi worker/quota/kích thước dataset/concurrency, mỗi lần là phép thử riêng và ghi cấu hình.

## 6. Từ các số đo, giả thuyết nào còn đứng vững?

**Hypothesis**, giả thuyết, là một lời giải thích tạo dự đoán có thể bị phép đo làm yếu hoặc bác bỏ. **Correlation**, tương quan, là hai biến cùng đổi, chưa tự chứng minh quan hệ nhân quả. “CPU tăng khi request chậm” có thể vì lượng request đến cùng tăng, không chỉ vì CPU là nguyên nhân.

| Giả thuyết | Dự đoán cần kiểm chứng cùng workload | Điều làm giảm độ tin cậy |
|---|---|---|
| Thiếu CPU khả dụng | Thread runnable đợi, CPU pressure/giới hạn tăng và latency cùng cửa sổ | Request chủ yếu ngủ, không pressure/throttle tương ứng |
| Chờ storage | I/O/await hoặc PSI I/O tăng đúng đường dữ liệu | Endpoint không đọc storage đáng kể, cache phục vụ |
| Chờ upstream | Proxy log thời gian upstream/timeout và backend chậm từ cùng đường | Backend trả nhanh theo cùng phạm vi, delay nằm trước/sau proxy |
| Chờ khóa | Thread/off-CPU stack cho thấy chờ cùng mutex | Thread đang tính toán liên tục; chưa thấy đường chờ khóa |

**Throttle** là bị hạn chế mức dùng tài nguyên theo cơ chế như quota CPU; **off-CPU** là thời gian thread không thực thi trên CPU, có thể runnable wait hoặc ngủ chờ. **Stack** là dấu vết chuỗi hàm để xác định đang làm/đợi ở đâu. Các phép trace sâu thuộc bài 34, bảng không yêu cầu thu stack bằng công cụ chưa có. Nếu chỉ có tổng CPU và curl, ghi “chưa đủ phân biệt chờ khóa/upstream” và nêu phép đo cần thêm.

Quy trình có thể nhớ theo sơ đồ:

```text
Mục tiêu + symptom có phạm vi → baseline + số liệu thô
  → ít nhất hai giả thuyết → dự đoán và phép bác bỏ
  → đo cùng cửa sổ → thử một biến có kiểm soát
  → xác nhận hiệu quả/chi phí → kết luận + điều chưa biết
```

Mỗi mũi tên yêu cầu đầu ra bước trước, không phải chuỗi lệnh tối ưu có sẵn. Nếu chưa tìm được cơ chế, kết luận “chưa xác định” có kế hoạch đo tiếp là đúng hơn tăng timeout rồi gọi là đã sửa. Đánh giá client tạo tải: curl/client cũng dùng CPU, đường mạng hoặc giới hạn socket; một client chậm có thể làm server có vẻ đạt throughput thấp. Đo cả hai đầu nếu phép thử phân tán.

## 7. Lỗi thường gặp, tự kiểm tra và phần nộp

- Load average cao không phải luôn CPU thiếu; có thể task chờ không ngắt được.
- `%util` I/O, CPU%, PSI và latency có ranh giới khác nhau; ghi đơn vị/khoảng mẫu trước so.
- Một ảnh tức thời bỏ lỡ burst; cần chuỗi mẫu nhưng không tăng tần số quan sát tới mức chính công cụ gây tải lớn.
- Tăng worker có thể làm nhiều thread cạnh tranh khóa/tài nguyên hơn; throughput tăng không bảo đảm p99 giảm.
- Tăng timeout không giải thích nguyên nhân và có thể tăng số request tồn tại theo quan hệ L/λ/W.

1. CPU trung bình 20%, một thread đợi quota: máy có thể chậm CPU-related không? **Tiêu chí:** có; phạm vi khả dụng/giới hạn khác CPU toàn host.
2. `L=λW` có lấy W=p99 để ra queue trung bình không? **Tiêu chí:** không, trung bình và cùng ranh giới/điều kiện ổn định.
3. HTTP 500 với curl status 0: mẫu thành công không? **Tiêu chí:** transport trao đổi được, tiêu chí ứng dụng 200 thất bại.
4. 20 mẫu không chậm hơn khi thêm một process CPU. Giả thuyết CPU bị bác bỏ hoàn toàn chưa? **Tiêu chí:** chỉ không được hỗ trợ trong workload/phạm vi thử; chưa suy ra mọi endpoint/tải.
5. iostat dòng đầu và curl 2 giây hiện tại có thể tương quan trực tiếp? **Tiêu chí:** xem dòng đầu từ boot/interval; phải cùng cửa sổ.
6. Tăng timeout giảm số lỗi nhưng request treo nhiều hơn. Đã đạt tối ưu chưa? **Tiêu chí:** xét latency/tài nguyên/throughput và tiêu chí người dùng, không chỉ error count.

Nộp symptom, baseline, phiên bản/cấu hình/workload, TSV thô, bảng ít nhất hai giả thuyết, bằng chứng hỗ trợ/phản bác, kết luận và phép đo tiếp theo nếu chưa rõ. Chỉ xóa đúng file sample/TSV trong thư mục lab khi không cần; không cần thay sysctl, drop cache hay benchmark raw disk. Tự nhắc: đo mục tiêu người dùng trước → chọn ranh giới tài nguyên → dự đoán cơ chế → thử có kiểm soát → giữ kết luận trong phạm vi bằng chứng. Bài 32 đi sâu CPU/bộ nhớ; bài 33 đi sâu I/O/mạng.

## Nguồn đối chiếu

- [sysstat](https://sysstat.github.io/), [iostat](https://man7.org/linux/man-pages/man1/iostat.1.html), [pidstat](https://man7.org/linux/man-pages/man1/pidstat.1.html), [vmstat](https://man7.org/linux/man-pages/man8/vmstat.8.html): nguồn dự án/công cụ và cách tính trường.
- [Kernel PSI](https://docs.kernel.org/accounting/psi.html), [proc filesystem](https://docs.kernel.org/filesystems/proc.html): accounting/phạm vi và dữ liệu kernel.
- [curl write-out](https://everything.curl.dev/usingcurl/verbose/writeout.html): các trường HTTP/time và cách xuất dữ liệu.
- [AWS Builders’ Library: load shedding](https://aws.amazon.com/builders-library/using-load-shedding-to-avoid-overload/): queue, tải đến và giới hạn phục vụ.

Ghi phiên bản bằng `vmstat -V`, `iostat -V`, `pidstat -V`, `curl --version`. Output trong bài là minh họa/cách đọc, không phải số đo cố định; thiếu công cụ/kernel feature phải ghi rõ thay vì tạo số liệu.
