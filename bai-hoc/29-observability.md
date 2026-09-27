# Bài 29 — Quan sát và vận hành dịch vụ

[Mục lục](../README.md) · [← Bài 28](28-ansible.md) · [Bài 30 →](30-backup-recovery.md)

## Mục tiêu: làm sao biết người dùng đang được phục vụ tốt?

Một chương trình vẫn chạy nhưng trả lỗi cho mọi yêu cầu. CPU chỉ dùng 10% nhưng người dùng phải đợi nhiều giây vì cơ sở dữ liệu bị chậm. Nếu chỉ đếm tiến trình hoặc xem “active”, bạn có thể bỏ lỡ cả hai tình huống.

**Observability — khả năng quan sát để suy ra trạng thái bên trong** dùng dữ liệu hệ thống phát ra để tìm hiểu điều đang xảy ra. **Monitoring — giám sát** theo dõi tín hiệu đã chọn và phát hiện điều kiện cần xử lý. Hai cách nhìn bổ sung nhau: biết có lỗi là điểm đầu; hiểu lỗi ở đâu cần dữ liệu có ngữ cảnh.

Sau bài này, bạn cần phân biệt log/metric/trace, định nghĩa SLI/SLO rõ mẫu số, kiểm tra dịch vụ từ bên ngoài, đọc phân bố thời gian và xây alert có hành động. Cần bài 15, 25, 28. Lab chính tạo dịch vụ HTTP giả trên loopback và file trong thư mục tạm; không dừng/restart dịch vụ của host, không gửi thông báo thật.

## 1. Từ yêu cầu của người dùng đến dữ liệu quan sát

**Service — dịch vụ** là chức năng phục vụ người dùng/chương trình khác. **Process — tiến trình** là một lần chương trình đang hoạt động; có tiến trình không đồng nghĩa chức năng đúng. **Request — yêu cầu** là một lần người dùng/chương trình xin dịch vụ thực hiện việc; **response — phản hồi** là kết quả trả về. **HTTP** là giao thức yêu cầu/phản hồi web; mã trạng thái 200 thường chỉ thành công, 503 chỉ dịch vụ tạm không sẵn sàng; chúng mô tả loại kết quả nhưng nội dung nghiệp vụ cũng cần được xét.

**Proxy — chương trình chuyển tiếp** nhận request rồi gửi đến **backend — thành phần xử lý phía sau**. **Instance — một bản dịch vụ đang hoạt động** có thể là một trong nhiều bản phục vụ cùng chức năng. **Traffic — lưu lượng yêu cầu** là các request đi qua hệ thống. Tình huống xuyên suốt: proxy vẫn chạy trong khi backend không trả dữ liệu.

```text
Người dùng → Proxy → Backend → Nơi lưu dữ liệu
     ↑          |       |           |
     |          +───────+───────────+── dữ liệu quan sát
     |                          |
Kiểm tra từ ngoài               v
                         Log / Metric / Trace
                                |
                                v
                      Phân tích và cảnh báo
```

Mũi tên ngang mô tả đường request; mũi tên xuống là dữ liệu đo/phát ra. Kiểm tra từ ngoài giúp thấy kết quả mà người dùng nhận, còn dữ liệu từng thành phần giúp xác định đoạn hỏng. Nếu chỉ xem proxy active, bạn mới biết chương trình proxy còn hoạt động, chưa biết toàn tuyến phục vụ thành công.

## 2. Log, metric và trace trả lời ba câu hỏi nào?

### 2.1. Log: sự kiện nào xảy ra, với ngữ cảnh gì?

**Log — nhật ký sự kiện** ghi một sự việc với thời gian/ngữ cảnh, như “request r17 nhận 503 vì kết nối backend thất bại”. **Timestamp — mốc ngày giờ sự kiện** giúp dựng thứ tự, nhưng cần timezone và đồng hồ đúng. **Request ID — số/chuỗi nhận diện một request** nối các sự kiện của cùng lần việc; không nên dùng nó làm nhãn metric cho mọi request.

**Structured log — nhật ký có cấu trúc** giữ các trường dễ phân tích, chẳng hạn JSON. **JSON** là định dạng dữ liệu theo cặp tên/giá trị; ví dụ giả:

```json
{"timestamp":"2026-01-01T00:00:00Z","request_id":"r17","component":"proxy","status":503,"duration_ms":120,"reason":"backend_unavailable"}
```

`Z` nghĩa UTC, mốc giờ chuẩn; **ms — mili giây** bằng 1/1.000 giây. Nhìn `request_id` để tìm sự kiện liên quan, `component` để biết nơi ghi, `reason` để định hướng. `reason` là lời giải thích của chương trình, vẫn cần kiểm chứng bằng nguồn khác. Không ghi mật khẩu/token hoặc dữ liệu người dùng nhạy cảm vào log; **token** là chuỗi chứng minh quyền truy cập.

Log có thể bị thiếu, trùng hoặc đến muộn; không thấy dòng không tự chứng minh sự kiện chưa xảy ra. Giữ chính sách lưu và quyền đọc phù hợp, cùng khả năng tìm theo trường.

### 2.2. Metric: mức độ và xu hướng đang ra sao?

**Metric — số đo tổng hợp** thể hiện một đại lượng, như tổng request hoặc bộ nhớ còn dùng được. **Time series — chuỗi mẫu theo thời gian** lưu giá trị của một metric với một tập nhãn. **Label — nhãn phân loại** như route hoặc phương thức; **cardinality — số tổ hợp nhãn/chuỗi riêng** ảnh hưởng tài nguyên lưu và truy vấn.

Ví dụ `requests_total{route="/health",status="200"}` là một chuỗi riêng. Nếu dùng `user_id` hoặc `request_id` với hàng triệu giá trị, số chuỗi có thể tăng rất lớn. Route nên được chuẩn hóa theo mẫu `/users/:id`, không lấy toàn URL chứa ID/query làm nhãn không giới hạn. **Instrumentation — gắn điểm đo vào chương trình** là cách tạo số liệu đúng chỗ, không chỉ cài máy chủ giám sát. [Thực hành instrumentation Prometheus](https://prometheus.io/docs/practices/instrumentation/).

Ba kiểu phổ biến cần đọc đúng:

| Kiểu | Ý nghĩa | Ví dụ và giới hạn |
|---|---|---|
| Counter, bộ đếm tích lũy | Tăng khi sự kiện xảy ra, có thể về đầu khi tiến trình restart | Tổng request; không lấy giá trị hiện tại làm tốc độ |
| Gauge, giá trị có thể tăng/giảm | Đại lượng tại lúc đo | Request đang xử lý, bộ nhớ available; mẫu không kể hết khoảng giữa hai lần đo |
| Histogram, phân bố theo khoảng | Đếm quan sát thuộc các khoảng và thường có sum/count | Thời gian request; độ chính xác phụ thuộc cấu trúc khoảng |

**Rate — tốc độ** là mức tăng trong một khoảng thời gian, có đơn vị như request/giây. Với counter 100 rồi 160 sau 10 giây, không reset, tốc độ trung bình là 6 request/giây. Nếu restart giữa hai mốc, trừ trực tiếp có thể ra số âm; hàm phù hợp như `rate()` xử lý reset theo dữ liệu nhưng vẫn phụ thuộc cửa sổ/mẫu có sẵn. [Kiểu metric Prometheus](https://prometheus.io/docs/concepts/metric_types/).

**Bucket — khoảng phân loại** trong classic histogram của Prometheus dùng cận trên và số đếm tích lũy: bucket ≤0,1 s đã nằm trong bucket ≤0,5 s. Không cộng các bucket tích lũy như các nhóm độc lập. **p99 — phân vị 99%** là mốc mà khoảng 99% quan sát không lớn hơn, theo phương pháp tính đã chọn; không là cực đại.

Không lấy trung bình p99 từng máy để có p99 toàn hệ thống. Hai máy có số lượng và phân bố mẫu khác nhau; cần gộp dữ liệu phân bố tương thích rồi tính phân vị theo trọng số mẫu. Classic histogram cho gộp bucket khi cùng ranh giới và nhãn phù hợp; native histogram có mô hình riêng. Summary có phân vị tính tại client nên không thể gộp tùy ý các giá trị phân vị. [Histogram và summary](https://prometheus.io/docs/practices/histograms/).

### 2.3. Trace: request tốn thời gian ở đoạn nào?

**Trace — dấu vết thực thi liên kết** nối các bước của một request qua nhiều thành phần. **Span — đoạn công việc trong trace** có mốc bắt đầu/kết thúc, thuộc tính và quan hệ cha/con. **Trace ID** nhận diện đường xử lý; **propagation — truyền ngữ cảnh** chuyển ID/ngữ cảnh giữa proxy/backend để các span nối được.

Ví dụ trace gồm proxy 800 ms, trong đó backend 750 ms và truy vấn dữ liệu 700 ms. Những span có thể lồng nhau; cộng 800+750+700 sẽ đếm trùng. Nhìn cấu trúc và đoạn chờ để tìm thời gian chi phối. **Sampling — chọn mẫu trace** giữ một phần request để hạn chế chi phí, nên không có trace không tự nghĩa request chưa diễn ra. [Traces của OpenTelemetry](https://opentelemetry.io/docs/concepts/signals/traces/).

Ba nguồn phối hợp: metric báo lỗi tăng từ 10:05; trace chỉ đoạn dữ liệu chậm; log cung cấp lỗi cụ thể theo ID. Không công cụ nào tự thay đầy đủ hai nguồn còn lại. [Các tín hiệu OpenTelemetry](https://opentelemetry.io/docs/concepts/signals/).

## 3. Health check hỏi dịch vụ sống hay sẵn sàng phục vụ?

**Health check — phép kiểm tra tình trạng dịch vụ** phải nói điều kiện đạt. **Liveness — kiểm tra có cần khởi động lại bản dịch vụ** thường nhắm tình trạng bản dịch vụ không tự phục hồi được. **Readiness — kiểm tra có nên nhận request mới** xét bản dịch vụ sẵn sàng phục vụ. **Startup check — kiểm tra giai đoạn khởi động** giúp tách khởi động lâu hợp lệ khỏi trạng thái hỏng.

Các tên probe được Kubernetes dùng với hành động cụ thể, nhưng hệ ngoài Kubernetes phải tự thiết kế hành động phù hợp; chúng không là ba lệnh systemd tự có. [Tài liệu probe Kubernetes](https://kubernetes.io/docs/concepts/workloads/pods/probes/).

Nếu liveness yêu cầu mọi dependency bên ngoài đều khỏe, một cơ sở dữ liệu chập chờn có thể làm hàng loạt app bị restart và tăng tải. Readiness có thể tạm ngừng chuyển request đến bản chưa phục vụ được mà không nhất thiết restart. **Dependency — phụ thuộc** là thành phần dịch vụ cần để thực hiện việc; cần xét chức năng nào thật sự cần nó, không gộp mọi thứ vào một kiểm tra.

Một endpoint `/health` trả 200 chỉ chứng minh điều logic endpoint đó kiểm tra; nếu nó chỉ trả một chuỗi cố định, chưa chứng minh đường dữ liệu chính hoạt động. **Endpoint — điểm gọi cụ thể của dịch vụ**, thường là đường URL và phương thức. Cần thêm **synthetic probe — yêu cầu thử chủ động** mô phỏng thao tác quan trọng, với dữ liệu thử không gây tác động nghiệp vụ thật.

## 4. SLI, SLO và error budget phải cùng mẫu số

**SLI — Service Level Indicator**, chỉ số đo mức phục vụ, có định nghĩa và cách đo cụ thể. Ví dụ: “tỷ lệ request đủ điều kiện trả kết quả hợp lệ trong 200 ms”. **SLO — Service Level Objective**, mục tiêu cho SLI trên cửa sổ thời gian, như “ít nhất 99,9% trong 30 ngày”. **Error budget — ngân sách phần không đạt** là phần được phép không đạt mục tiêu theo đúng định nghĩa ấy. [SLO của Google SRE](https://sre.google/sre-book/service-level-objectives/).

**Denominator — mẫu số** là tất cả sự kiện đủ điều kiện; **numerator — tử số** là số sự kiện đạt. Phải quyết định trước: request nào tính, retry tính ra sao, lỗi client loại nào loại trừ vì lý do gì, timeout được ghi ở đâu, mốc latency đo từ đâu. Không tùy ý bỏ request lỗi sau khi nhìn số để làm đẹp SLI.

Ví dụ request-based tự đặt: 1.000.000 request đủ điều kiện trong 30 ngày, SLO 99,9% cho phép 0,1%×1.000.000=1.000 request không đạt. Có 800 không đạt thì đã dùng 80% ngân sách trong cửa sổ đó. Một triệu request không đồng nghĩa số phút cố định: đây là SLI theo request, không phải theo thời gian.

Nếu có 20 mẫu probe, 15 mã 200 nhưng 5 trong số đó trễ ngưỡng, SLI kết hợp status/latency chỉ có 10/20=50%, không phải 75%. Mã 200 với nội dung sai nghiệp vụ cũng có thể không đạt theo định nghĩa thật. Probe nhỏ dưới đây chỉ dùng tiêu chí kỹ thuật đơn giản để học, không ước lượng SLO tháng đáng tin.

## 5. Lab: nhìn lỗi từ bên ngoài một HTTP service giả

### 5.1. Tạo môi trường có phạm vi rõ

Điều kiện: Linux, Bash, Python 3 và curl. **Loopback — đường mạng quay lại chính máy** ở `127.0.0.1` giữ dịch vụ thử không nghe trên mạng ngoài. **Port — số cổng nhận kết nối** sẽ được hệ chọn còn trống. Python `http.server` dùng ở đây làm fixture học tập, không là server production. [Tài liệu Python http.server](https://docs.python.org/3/library/http.server.html).

```bash
lab_dir=$(mktemp -d)
printf 'Lab directory: %s\n' "$lab_dir"
cd "$lab_dir" || exit 1
command -v python3 curl
```

Lưu `fixture.py`:

```python
import datetime
import json
import pathlib
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        start = time.monotonic()
        status = 503 if self.path == '/error' else 200
        if self.path == '/slow':
            time.sleep(0.3)
        body = b'lab response\n'
        self.send_response(status)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        print(json.dumps({
            'timestamp': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'path': self.path, 'status': status,
            'duration_ms': round((time.monotonic() - start) * 1000, 3)
        }), flush=True)
    def log_message(self, format, *args):
        pass

server = HTTPServer(('127.0.0.1', 0), Handler)
pathlib.Path('ready.json').write_text(json.dumps({'port': server.server_port}))
server.serve_forever()
```

Server trả 503 cho `/error`, ngủ 0,3 giây rồi trả 200 cho `/slow`, còn đường khác trả 200 nhanh. **Monotonic clock — đồng hồ đo khoảng tăng đơn điệu** dùng đo duration; đồng hồ ngày giờ UTC dùng timestamp. Port 0 yêu cầu hệ chọn cổng rảnh, file `ready.json` báo cổng thực. Log server đo đoạn xử lý phía server, khác toàn thời gian curl nhìn thấy.

### 5.2. Khởi chạy fixture và thu probe, giữ cả exit status

```bash
python3 fixture.py > server.log 2> server-errors.log &
fixture_pid=$!
# Dọn đúng tiến trình của lab nếu shell thoát sớm.
trap 'kill "$fixture_pid" 2>/dev/null || true; wait "$fixture_pid" 2>/dev/null || true' EXIT
for _ in {1..50}; do
    [[ -s ready.json ]] && break
    sleep 0.1
done
if [[ ! -s ready.json ]]; then
    cat server-errors.log
    exit 1
fi
lab_port=$(python3 -c 'import json; print(json.load(open("ready.json"))["port"])')
printf 'timestamp\tpath\thttp_code\tseconds\tcurl_exit\n' > probe.tsv
for i in {1..20}; do
    if (( i <= 10 )); then route=/ok
    elif (( i <= 15 )); then route=/error
    else route=/slow
    fi
    stamp=$(date -u +%FT%TZ)
    if measured=$(curl --noproxy '*' --silent --show-error --max-time 2 --output /dev/null \
        --write-out '%{http_code}\t%{time_total}' \
        "http://127.0.0.1:$lab_port$route" 2>> probe-errors.log); then
        curl_status=0
    else
        curl_status=$?
    fi
    printf '%s\t%s\t%s\t%s\n' "$stamp" "$route" "$measured" "$curl_status" >> probe.tsv
done
cat probe.tsv
```

**PID — số nhận diện tiến trình** của fixture được lưu bằng `$!`; `kill` gửi tín hiệu đến đúng process của lab, không dùng `killall python3`. **Trap — tác vụ shell chạy khi có sự kiện** ở đây dọn fixture khi thoát. `--noproxy '*'` bỏ proxy từ môi trường cho yêu cầu loopback của lab; `curl --max-time 2` giới hạn một request; `%{time_total}` là giây theo góc nhìn client. `2>>` nối lỗi vào file riêng, không bỏ bằng chứng lỗi.

Không dùng `--fail` trong phép đo này để phân biệt: HTTP 503 vẫn có thể có `curl_exit=0` vì trao đổi HTTP đã thành công về vận chuyển, còn ứng dụng trả lỗi. Lỗi kết nối có thể là code `000` và exit khác 0; `000` không là HTTP status thật. [Manual curl](https://curl.se/docs/manpage.html).

Đây là 20 probe tuần tự, không là **load benchmark — phép thử năng lực chịu tải**. Không có nhiều client đồng thời, không đo giới hạn throughput; mỗi request mới chỉ gửi sau request trước hoàn tất.

### 5.3. Tính SLI từ định nghĩa, không chỉ đếm 200

Lưu `analyse.py`:

```python
import csv
import math

with open('probe.tsv') as source:
    rows = list(csv.DictReader(source, delimiter='\t'))
threshold_seconds = 0.2
valid_transport = [r for r in rows if int(r['curl_exit']) == 0]
good = [r for r in rows if int(r['curl_exit']) == 0
        and r['http_code'] == '200'
        and float(r['seconds']) <= threshold_seconds]
print('eligible:', len(rows), 'good:', len(good))
if rows:
    print('SLI:', f'{100 * len(good) / len(rows):.2f}%')
values = sorted(float(r['seconds']) for r in valid_transport)
if values:
    p99 = values[math.ceil(0.99 * len(values)) - 1]
    print('transport-completed duration_seconds p99:', p99, 'max:', values[-1])
else:
    print('No transport-completed samples')
print('http_503:', sum(r['http_code'] == '503' for r in rows))
print('transport_failed:', sum(int(r['curl_exit']) != 0 for r in rows))
```

```bash
python3 analyse.py
cat server.log
cat probe-errors.log
```

Định nghĩa mẫu: mọi lượt probe là đủ điều kiện, kể cả lỗi; tốt khi vận chuyển thành công, code 200 và duration≤0,2 giây. Bình thường bộ dữ liệu tạo ra 10 tốt/20=50%, 5 code 503, 5 code 200 chậm. Nếu `/ok` cũng chậm do tải máy, số tốt có thể ít hơn 10; đọc dòng thật thay vì ép bằng kỳ vọng.

Phân vị trong mã chỉ tính duration các lượt vận chuyển hoàn tất, gồm cả HTTP 503. Nó không là phân vị “request thành công”, cũng không đại diện thời gian của các lượt không có kết quả đầy đủ. **Nearest-rank — cách chọn hạng làm tròn lên** lấy mẫu thứ ceil(0,99×N) sau sắp tăng; với N=20, p99 chính là max. Mẫu nhỏ như vậy không đủ phân tích đuôi hiếm.

### 5.4. Dừng đúng fixture rồi nhìn lỗi kết nối

```bash
kill "$fixture_pid"
wait "$fixture_pid" || true
trap - EXIT
if curl --noproxy '*' --silent --show-error --max-time 2 --output /dev/null \
    --write-out 'after_stop code=%{http_code} seconds=%{time_total}\n' \
    "http://127.0.0.1:$lab_port/ok"; then
    printf 'Unexpected success: inspect what now listens on the port.\n'
else
    printf 'curl exit after stop=%s\n' "$?"
fi
```

Kỳ vọng kết nối bị từ chối với code 000 và exit thường là 7. Nếu khác, đọc stderr: timeout, mạng hoặc cổng đã được tiến trình khác dùng có thể đổi kết quả. `wait` có mã khác 0 khi process bị tín hiệu kết thúc, nên dùng nhánh `|| true` cho bước dọn. Không ghi request sau stop vào mẫu 20 để giữ cửa sổ/định nghĩa phân tích rõ.

Lab cho thấy thành công HTTP, thành công vận chuyển và process sống là các chuyện khác nhau. Nó chưa tạo proxy, chưa đo người dùng ngoài máy và chưa mô phỏng database thật.

## 6. Nối với dịch vụ systemd và proxy của bài trước

**Systemd** là bộ quản lý dịch vụ thường dùng; **unit — đơn vị quản lý** có thể mô tả service. **Journal — nhật ký do systemd-journald thu** có thể chứa dữ liệu dịch vụ nếu cấu hình cho phép. Các lệnh chỉ đọc, cần thay tên unit đúng bài 15:

```bash
journalctl -u linux-lab-http --since '-10 minutes' --no-pager
systemctl show linux-lab-http -p MainPID -p NRestarts -p ActiveState
```

`-u` chọn unit, `--since` giới hạn thời gian; không có dòng có thể do sai unit, quyền, retention hoặc chương trình không ghi vào journal. `MainPID` là tiến trình chính manager biết, `NRestarts` phản ánh restart tự động theo semantics của systemd, không là tổng mọi sự cố hay mọi lần bạn start thủ công. `ActiveState=active` vẫn không chứng minh backend trả đúng. [Manual journalctl](https://www.freedesktop.org/software/systemd/man/latest/journalctl.html), [systemd service](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html). Nếu trang dự án không truy cập được, đối chiếu bản manual đóng gói của Debian: [journalctl](https://manpages.debian.org/testing/systemd/journalctl.1.en.html), [systemd.service](https://manpages.debian.org/testing/systemd/systemd.service.5.en.html); vẫn cần dùng manual đúng phiên bản trên máy.

Nhánh VM clone đã có proxy/backend: đo trước, chủ động dừng backend thử, tiếp tục probe qua proxy, xem log hai bên, phục hồi backend và đo lại. Ghi timeline và kế hoạch phục hồi trước khi dừng. Không thực hiện trên dịch vụ host đang cần dùng. Proxy có thể vẫn active trong cả ba giai đoạn nhưng status/latency đổi; đây là điều cần chứng minh, không áp mã lỗi cụ thể cho mọi proxy.

## 7. Thu metric host cần chọn tín hiệu theo câu hỏi

**Prometheus** là hệ thu/lưu/truy vấn số đo theo thời gian. **Exporter — chương trình chuyển số liệu thành endpoint metric** giúp hệ thu đọc được. **Node exporter** cung cấp số liệu host; **scrape — lần đọc số liệu từ endpoint** chỉ có thể thành công khi đường mạng/công cụ hoạt động. Thu thành công không tự chứng minh ứng dụng phục vụ tốt. [Hướng dẫn node exporter chính thức](https://prometheus.io/docs/guides/node-exporter/).

Không cần cài để hoàn thành lab. Khi triển khai, chỉ mở endpoint trên đường mạng giám sát phù hợp, kiểm tra nguồn gói/bản công cụ và quyền theo môi trường. Chọn tín hiệu trước:

| Câu hỏi | Tín hiệu phù hợp | Giới hạn cần nhớ |
|---|---|---|
| CPU có bị tranh/thiếu thời gian không? | Thời gian CPU theo trạng thái, tải và giới hạn nhóm | CPU cao có thể là công việc tính toán hợp lệ |
| Bộ nhớ có áp lực không? | Memory available, swap và hoạt động thu hồi phù hợp | Free thấp do cache không tự nghĩa thiếu RAM |
| Chỗ lưu sắp hết không? | Dung lượng khả dụng, tốc độ tăng, inode còn | Không chỉ nhìn phần trăm của một loại tài nguyên |
| Mạng có lỗi không? | Lỗi/drop, lưu lượng và độ trễ theo phạm vi | Counter reset và phần nằm ngoài host vẫn ảnh hưởng |
| Người dùng được phục vụ không? | Request đủ điều kiện/tốt, error, duration | Cần điểm đo sát trải nghiệm người dùng |

**Filesystem — hệ tổ chức tệp** quản lý tên, dữ liệu và thông tin file; **inode — bản ghi thông tin một đối tượng tệp** trên nhiều loại filesystem có thể là tài nguyên hữu hạn. Còn byte trống nhưng hết inode vẫn có thể không tạo file mới. `df -h` xem dung lượng; `df -i` xem inode nếu filesystem hỗ trợ ý nghĩa đó. Kết quả của vùng lưu host không tự phản ánh quota của container/ứng dụng.

## 8. Alert tốt cần khiến người trực làm gì?

**Alert — cảnh báo theo điều kiện đo** báo vấn đề cần xử lý. **Dashboard — bảng xem số liệu** giúp quan sát; **runbook — hướng dẫn xử lý tình huống** đưa các bước kiểm tra và phục hồi. **Symptom — biểu hiện người dùng thấy** khác **cause — nguyên nhân**: lỗi tăng là biểu hiện, CPU cao có thể là một nguyên nhân hoặc hoạt động bình thường.

Một mẫu cảnh báo bằng văn bản, không gửi thông báo thật:

```text
Tên: Request hợp lệ không đạt tăng cao
Phạm vi: dịch vụ lab, đường /api đã chuẩn hóa
Điều kiện: tỷ lệ không đạt vượt ngưỡng đã chọn, đủ lượng mẫu,
           kéo dài qua cửa sổ theo thiết kế
Bằng chứng: dashboard SLI/error/duration và link truy vấn log
Bước đầu: xác nhận probe → xem thay đổi gần nhất → kiểm tra dependency
Phục hồi: theo runbook đã thử, xác minh bằng probe sau thao tác
Người chịu trách nhiệm: vai trò trực được chỉ định
```

Ngưỡng và cửa sổ phải dựa vào SLO/tải, không chép CPU 80% cho mọi hệ. **Burn rate — tốc độ tiêu ngân sách lỗi** so tỷ lệ lỗi hiện tại với phần lỗi SLO cho phép; ví dụ SLO 99,9%, phần lỗi 0,1%, cửa sổ gần đây có 1% không đạt thì burn rate=10 theo cùng định nghĩa. Kết hợp nhiều cửa sổ giúp phát hiện nhanh và bền mà hạn chế nhiễu. [Google SRE về cảnh báo SLO](https://sre.google/workbook/alerting-on-slos/).

Với disk, ngoài dung lượng cần tốc độ tăng và thời gian can thiệp. Ví dụ minh họa còn 10 GiB và tăng đều 2 GiB/giờ thì mô hình tuyến tính cho 5 giờ đến hết; **GiB** là đơn vị 2^30 byte. Tốc độ có thể đổi, xóa/rotation có thể xảy ra nên đây là dự báo có giả định, không lịch hết đĩa chắc chắn.

Một rule tồn tại chưa chứng minh người trực nhận được. Cần diễn tập trên môi trường thử, theo dõi đường đánh giá rule→bộ phân phối→kênh thông báo→người nhận và xác nhận nhận; không gửi cảnh báo tới người thật khi chưa được phép. Bài này chỉ yêu cầu soạn mẫu và kế hoạch diễn tập.

## 9. Đồng hồ và graceful shutdown ảnh hưởng số đo ra sao?

**Wall clock — đồng hồ ngày giờ** dùng timestamp liên hệ sự kiện giữa máy. **Monotonic clock — đồng hồ tăng đơn điệu** dùng đo duration trong cùng phạm vi clock để tránh nhảy do chỉnh giờ. Không trừ hai giá trị monotonic của hai host tùy ý để tính latency mạng; chúng không có chung mốc bảo đảm. **NTP — giao thức đồng bộ thời gian** và timezone rõ giúp đối chiếu log; bật NTP chưa chắc đã sync.

**Graceful shutdown — dừng có phối hợp** thường cần ngừng nhận việc mới, hoàn tất hoặc chuyển giao việc đang chạy trong hạn cho phép, rồi giải phóng tài nguyên. **Timeout — thời hạn chờ** giới hạn bước dừng; hết hạn có thể cần dừng cưỡng bức theo manager. Đánh dấu không ready và thật sự rút khỏi đường nhận traffic có độ trễ riêng; phải xét request đang chạy, kết nối giữ lâu và tác vụ nền.

Nếu server bị dừng giữa request, client có thể nhận lỗi dù log process exit “bình thường”. Vì vậy đo trước/trong/sau shutdown, kiểm tra tỷ lệ lỗi và công việc còn dang dở. Fixture lab bị tín hiệu kết thúc chỉ là thử vận chuyển sau stop, không là mẫu graceful shutdown production hoàn chỉnh.

## 10. Lỗi thường gặp và tự kiểm tra

| Nhầm lẫn | Điều cần kiểm tra |
|---|---|
| Process count đúng nên dịch vụ khỏe | Probe chức năng, status, nội dung và thời gian |
| Curl exit 0 nghĩa nghiệp vụ thành công | Đọc HTTP code và nội dung; 503 vẫn có thể exit 0 khi không dùng fail |
| p99 trung bình các máy là p99 toàn hệ | Gộp phân bố tương thích/quan sát với số mẫu đúng |
| Không có trace nghĩa không có request | Xem sampling và truyền ngữ cảnh |
| CPU thấp nghĩa không có sự cố | Có thể chờ khóa, thiết bị hoặc dependency |
| Mọi request ID làm label để dễ tìm | Log/trace cho ID; metric cần giới hạn cardinality |
| SLO 99,9% theo request bằng uptime 99,9% | Hai mẫu số/định nghĩa khác nhau |
| Rule có rồi nên đường báo chắc tốt | Cần diễn tập nhận thông báo theo phạm vi đã cho phép |

1. Một proxy active, backend mất kết nối: tín hiệu nào phát hiện sát người dùng? **Đối chiếu:** probe qua proxy hoặc SLI request, sau đó log/trace giúp tìm backend.
2. Counter từ 1000 xuống 20 sau restart: có −980 request không? **Đối chiếu:** không; đó là reset, không trừ hai mốc như gauge.
3. 20 probe gồm 10 phản hồi 200 nhanh, 5 phản hồi 200 chậm, 5 phản hồi 503 nhanh với tiêu chí 200 và thời gian ≤0,2 giây. SLI là bao nhiêu? **Đối chiếu:** 10/20=50%.
4. SLO 99,9% trên 1.000.000 request, có 1.200 không đạt: còn budget không? **Đối chiếu:** cho phép 1.000, đã vượt 200 theo định nghĩa này.
5. Một file log không có timezone: dựng timeline nhiều máy có khó gì? **Đối chiếu:** không biết mốc có cùng thang giờ, cần timezone và độ lệch đồng hồ.
6. Liveness phụ thuộc toàn bộ database ngoài: nguy cơ gì? **Đối chiếu:** sự cố phụ thuộc có thể gây restart hàng loạt không chữa nguyên nhân.

Nộp định nghĩa SLI có tử/mẫu số và cửa sổ, bảng probe thật hoặc ghi rõ chưa chạy, phân tích status/latency/exit, log tương ứng, mẫu alert với runbook và timeline stop fixture. Với nhánh proxy clone, thêm giai đoạn backend dừng/phục hồi. Không coi 20 mẫu là báo cáo đạt SLO dài hạn.

**Tự nhắc lại:** quan sát từ người dùng trước rồi đi vào thành phần. Log kể sự kiện, metric chỉ mức độ/xu hướng, trace nối đường xử lý. SLI có định nghĩa, SLO có cửa sổ, alert cần hành động và đường nhận được thử. Bài 30 bổ sung phục hồi khi phát hiện vấn đề.

## Nguồn đối chiếu

- [OpenTelemetry signals](https://opentelemetry.io/docs/concepts/signals/), [traces](https://opentelemetry.io/docs/concepts/signals/traces/).
- [Prometheus metric types](https://prometheus.io/docs/concepts/metric_types/), [histograms](https://prometheus.io/docs/practices/histograms/), [instrumentation](https://prometheus.io/docs/practices/instrumentation/), [node exporter](https://prometheus.io/docs/guides/node-exporter/).
- [Google SRE SLO](https://sre.google/sre-book/service-level-objectives/), [alerting](https://sre.google/workbook/alerting-on-slos/), [Kubernetes probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/).
- [curl manual](https://curl.se/docs/manpage.html), [Python http.server](https://docs.python.org/3/library/http.server.html), [journalctl](https://www.freedesktop.org/software/systemd/man/latest/journalctl.html), [systemd service](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html). Nếu trang dự án không truy cập được, đối chiếu bản manual đóng gói của Debian: [journalctl](https://manpages.debian.org/testing/systemd/journalctl.1.en.html), [systemd.service](https://manpages.debian.org/testing/systemd/systemd.service.5.en.html); vẫn cần dùng manual đúng phiên bản trên máy.
