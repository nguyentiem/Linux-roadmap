# Bài 40 — Đồ án tổng hợp và bảo vệ quyết định kỹ thuật

[Mục lục](../README.md) · [← Bài 39](39-senior-troubleshooting.md)

## Mục tiêu: từ biết lệnh đến dựng một hệ thống có thể bàn giao

Bạn đã biết xem tiến trình, đọc mạng, đo CPU, viết cấu hình và phục hồi file. Đồ án nối các kiến thức ấy bằng một dịch vụ lưu đơn hàng: người dùng tạo đơn, đọc lại, hệ thống có thể khởi động lại, chịu các lỗi thử có kiểm soát và được dựng lại từ tài liệu.

Mục tiêu không chỉ là “curl trả 200”. Bạn cần biết yêu cầu đi qua đâu, dữ liệu nằm ở đâu, ai có quyền truy cập, điều gì giới hạn hiệu năng, và khi máy dữ liệu mất thì lấy lại dịch vụ bằng cách nào. Kết quả phải do bạn đo; mọi con số minh họa trong bài là đầu vào thiết kế, không phải thành tích đã đạt.

Cần hoàn thành các lab cốt lõi bài 01–39, đặc biệt 15, 24–30 và 31–39. Những khái niệm dùng để quyết định vẫn được nhắc tại đây. Bài là hướng dẫn thực hiện đồ án trong môi trường lab riêng; chưa chạy đồ án thì ghi rõ mốc nào mới là kế hoạch.

## 1. Dịch vụ cần làm gì trước khi chọn công nghệ?

**Service — dịch vụ** là chức năng được chương trình cung cấp cho người dùng hoặc chương trình khác. **Client — bên yêu cầu** gửi yêu cầu; **server — bên phục vụ** xử lý và trả kết quả. **Request/response — yêu cầu/phản hồi** là một lần trao đổi có đầu vào và kết quả cụ thể.

**HTTP — giao thức trao đổi web** quy định phương thức, đường dẫn, trạng thái và nội dung. **API — giao diện để chương trình gọi chức năng** trong đồ án dùng HTTP, như tạo đơn qua `POST /orders`. **Endpoint — điểm gọi cụ thể** gồm phương thức và đường dẫn. **JSON — định dạng dữ liệu có cấu trúc** biểu diễn trường tên/giá trị, ví dụ `{"id":1,"amount":100}`. Trước khi viết chương trình, xác định các bên phải hiểu chung những gì.

Chọn một ứng dụng đơn hàng nhỏ; nếu thích ghi chú có thể đổi dữ liệu nhưng phải giữ chức năng tạo/đọc và phục hồi được. Hợp đồng API mẫu dưới đây là **thiết kế của bài**, cần triển khai theo nó hoặc ghi rõ phiên bản hợp đồng khác của bạn:

| Điểm gọi | Đầu vào | Kết quả cần có | Điều phải kiểm tra |
|---|---|---|---|
| `GET /health/live` | Không | HTTP 200 khi bản ứng dụng còn hoạt động phù hợp | Không giả vờ kiểm tra database nếu chỉ trả chuỗi cố định |
| `GET /health/ready` | Không | 200 khi có thể phục vụ chức năng đã định, 503 khi chưa sẵn sàng | Kiểm tra khả năng cần thiết, có giới hạn thời gian |
| `POST /orders` | JSON có `amount` là số nguyên không âm | 201 cùng JSON chứa `id` đã tạo và `amount` | Dữ liệu hợp lệ đã được ghi nhận trước khi trả thành công |
| `GET /orders/ID` | ID hợp lệ | 200 và đơn tương ứng; 404 nếu không có | Đọc thật từ dữ liệu, không chỉ trả giá trị đã ghi nhớ trong process |
| `POST /orders` với dữ liệu sai | Sai JSON, thiếu trường, số âm/sai kiểu | 400 và thông báo lỗi có cấu trúc | Không tạo thêm đơn, không lộ secret hoặc chi tiết kết nối |

**Status — mã trạng thái HTTP** như 201 cho tạo thành công, 400 cho yêu cầu không hợp lệ, 404 cho không tìm thấy, 503 cho dịch vụ chưa cung cấp được chức năng. Quy tắc xử lý lỗi là hợp đồng của ứng dụng; lỗi database không được chuyển thành “đơn không tồn tại” để che vấn đề.

**Database — cơ sở dữ liệu** tổ chức dữ liệu và điều khiển cập nhật/truy vấn. **Transaction — giao dịch** là đơn vị cập nhật được database quản lý theo cơ chế của nó; **commit — chấp nhận giao dịch** là mốc database thông báo đã hoàn tất theo cấu hình độ bền. App trả 201 trước khi commit rồi commit thất bại sẽ khiến client tưởng đơn tồn tại. Cần xử lý thất bại và xác định mốc trả thành công. Độ bền còn phụ thuộc cấu hình database/lưu trữ; bài 23 và 30 giải thích các lớp ấy.

Ứng dụng Python chỉ phục vụ file tĩnh ở bài 15/25 giúp thử mạng nhưng không đáp ứng yêu cầu lưu dữ liệu. Bạn có thể viết app bằng ngôn ngữ quen thuộc; không cần framework lớn. **Framework — bộ khung phần mềm** cung cấp cấu trúc/hàm dùng lại, không tự giải quyết quyền, backup hay tính đúng của giao dịch.

### 1.1. Khi client gửi lại yêu cầu thì sao?

**Retry — thử lại yêu cầu** có thể xảy ra khi client không nhận phản hồi dù server đã commit. Gửi lại POST không có cơ chế nhận diện có thể tạo hai đơn. Với bản đầu của đồ án, ghi rõ POST tạo đơn không tự bảo đảm chống trùng và không tự động retry thao tác này trong công cụ đo.

Nhánh nâng cao: thiết kế **idempotency key — khóa nhận diện một thao tác để gửi lại không tạo thêm kết quả** và lưu quan hệ khóa/kết quả theo giao dịch phù hợp. Phải xét cạnh tranh, thời gian giữ khóa, nội dung khác với cùng khóa và thử lỗi sau commit/trước phản hồi. Chỉ thêm header chưa tạo ra tính idempotent; nếu không làm nhánh này, trình bày giới hạn trung thực.

## 2. Ba máy chia trách nhiệm thế nào?

**VM — máy ảo** có hệ điều hành khách riêng. **Host — máy chạy các VM** vẫn cung cấp CPU, bộ nhớ và lưu trữ vật lý; ba VM cùng host chưa độc lập trước host hỏng. **Kernel — nhân hệ điều hành** của mỗi guest quản lý tài nguyên mà VM nhìn thấy. **Process — tiến trình** là một lần chạy chương trình; có PID, mã số nhận diện, và danh tính/quyền của nó.

**Proxy — chương trình trung gian đứng trước app** nhận yêu cầu rồi tạo trao đổi đến app. **Backend — bên phục vụ phía sau** ở đây là app. **Control machine — máy điều khiển cấu hình** chạy công cụ quản trị/tự động hóa; có thể là host lab. **Monitoring — phần giám sát** thu tín hiệu và thực hiện kiểm tra; có thể đặt cùng control machine để giảm nhu cầu máy, nhưng phải ghi ranh giới đó.

```text
Client lab ─HTTP→ Proxy VM ─HTTP→ App VM ─giao thức DB→ Database VM
                     |              |                       |
                     +──── log/metric/probe ────────────────+
                                      |
                                      v
                              Nơi quan sát của lab

Database + config ─backup nhất quán→ kho ngoài miền lỗi đã chọn
                                              |
                                              v
                                    VM/database restore mới
Control machine ─cấu hình có phiên bản→ các VM đích
```

Đọc hàng đầu là đường nghiệp vụ; hàng giữa là đường quan sát; hàng dưới là đường phục hồi và điều khiển. Proxy không dùng kết nối client nguyên xi làm kết nối database. Mất đường giám sát khác mất đường request, nhưng có thể làm chậm phát hiện sự cố.

**CPU — bộ xử lý thực thi lệnh** và **RAM — bộ nhớ làm việc** là tài nguyên host phải chia cho guest. **vCPU — CPU logic guest thấy** cần được host lập lịch. Tổng RAM cấp cho VM cộng RAM host và công cụ đo phải phù hợp máy thực. Một kế hoạch minh họa có proxy nhỏ hơn app/database; đừng coi số VM là tiêu chí mạnh hơn khả năng chạy ổn định.

Nếu không đủ tài nguyên, gộp vai trò hoặc dùng ít VM hơn và ghi rõ: app/database cùng VM chia sẻ miền lỗi, không thử được mất máy độc lập theo sơ đồ ba VM. Không tuyên bố đã thử ba máy chỉ vì có ba process. Chương 37 giúp đọc các lớp host/guest và giới hạn số đo.

### 2.1. Vẽ đường mạng và đường quản trị trước khi mở cổng

**IP — địa chỉ lớp mạng** giúp tìm đường đến máy. **Port — số cổng giao tiếp** giúp chọn ứng dụng trên địa chỉ. **Socket — đối tượng giao tiếp ứng dụng mở để trao đổi dữ liệu** được kernel quản lý. **Bind — gắn socket vào địa chỉ/cổng cục bộ** chọn nơi nhận; **listener — điểm chờ kết nối** thể hiện bằng `ss -lnt`. **Route — đường định tuyến** chọn cách đến IP; **firewall — bộ lọc lưu lượng** quyết định những gói được phép theo quy tắc.

Bảng mẫu cho mạng lab riêng, địa chỉ thực phải lấy từ môi trường của bạn:

| Vai trò | Địa chỉ minh họa | Điểm dịch vụ | Bên được phép kết nối |
|---|---|---|---|
| Proxy | 192.168.56.10 | HTTP 8081 | Client lab đã chọn |
| App | 192.168.56.11 | HTTP 8080 | Proxy và đường kiểm tra quản trị đã định |
| Database PostgreSQL | 192.168.56.12 | TCP 5432 | App và đường backup/restore quản trị đã định |
| Control machine | Theo mạng thực | SSH đến VM | Chỉ đường quản trị phù hợp |

Đây là ví dụ mạng riêng, không yêu cầu thay IP host. **SSH — giao thức quản trị từ xa có mã hóa** cần xác minh khóa máy chủ và quyền đăng nhập như bài 27. Có thể dùng mạng nội bộ/host-only theo hypervisor — bộ quản lý VM — để giới hạn lab; phân biệt với bridge đưa VM vào mạng ngoài. Ghi đường client→proxy, proxy→app, app→database, control→các VM và đường về; không chỉ một danh sách cổng.

App/database nên nghe đúng địa chỉ lab cần thiết. `127.0.0.1` trong App VM chỉ quay về chính VM đó: Proxy VM không vào được listener loopback của app bằng IP app. Ngược lại, `0.0.0.0` không tự vượt firewall; cần kiểm tra từ máy đúng nguồn. Không áp ruleset chặn toàn bộ lên máy đang cần quản trị.

**TLS — cơ chế bảo vệ kết nối bằng mã hóa/xác minh theo cấu hình** dùng với HTTPS, tức HTTP qua TLS. Nếu lab dùng HTTP trên mạng riêng, ghi rõ chưa mã hóa/chứng thực chặng ấy. Nhánh TLS phải kiểm tra tên máy, chuỗi tin cậy, hạn chứng chỉ và đồng hồ; không dùng `curl -k` làm điều kiện nghiệm thu. HTTPS tại proxy chưa chứng minh app/database được bảo vệ cùng cách. [Nginx proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html).

## 3. Dữ liệu, danh tính và phiên bản cần được quản lý ra sao?

**SQL — ngôn ngữ truy vấn/cập nhật dữ liệu** được app gửi database. **Schema — cấu trúc dữ liệu của ứng dụng** mô tả bảng, cột và ràng buộc; trong PostgreSQL schema còn có nghĩa không gian tên chứa đối tượng. **Constraint — ràng buộc** giúp database từ chối dữ liệu không hợp lệ, chẳng hạn ID trùng hoặc số tiền âm.

Một bảng PostgreSQL mẫu để viết vào migration của đồ án, chỉ áp lên database lab mới đã xác nhận:

```sql
CREATE TABLE orders (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    amount integer NOT NULL CHECK (amount >= 0),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

`IDENTITY` tạo mã theo cơ chế database; `PRIMARY KEY` bảo đảm khóa chính nhận diện hàng; `NOT NULL` không chấp nhận thiếu giá trị; `CHECK` kiểm tra số tiền không âm. `timestamptz` lưu mốc thời gian có quy tắc biểu diễn theo timezone — múi giờ — của phiên; không mặc định chuỗi in ở mọi máy giống nhau. ID có thể có khoảng trống, không dùng tính liên tục của ID để chứng minh không mất đơn. Đối chiếu [PostgreSQL CREATE TABLE](https://www.postgresql.org/docs/current/sql-createtable.html) với phiên bản đang dùng.

**Parameterized query — truy vấn có tham số tách khỏi câu lệnh** giúp thư viện/database xử lý dữ liệu đầu vào như giá trị, không ghép thành mã SQL bằng chuỗi. **SQL injection — đưa đầu vào thành lệnh SQL ngoài ý muốn** có thể xảy ra khi ghép chuỗi sai. Dùng cơ chế tham số đúng driver, kiểm tra kiểu/giới hạn đầu vào và giới hạn kích thước request; không chỉ thay vài dấu nháy bằng tay. [Ví dụ tách tham số trong libpq của PostgreSQL](https://www.postgresql.org/docs/current/libpq-exec.html) minh họa nguyên tắc; cú pháp placeholder phải theo thư viện mà app thật dùng.

**User/role — danh tính và tập quyền** trong database khác user Linux chạy process. **Permission — quyền thao tác** quyết định danh tính được làm gì. App nên dùng user hệ điều hành riêng và quyền database cần cho tạo/đọc đơn; không dùng tài khoản quản trị database chỉ vì kết nối dễ hơn. Quyền migrate và quyền chạy app có thể tách riêng.

**Secret — dữ liệu bí mật** như mật khẩu hoặc khóa riêng phải ở cơ chế cấu hình được bảo vệ phù hợp, không nằm trong Git, log, command line hoặc hồ sơ bằng chứng. **Git — công cụ quản lý lịch sử thay đổi** giữ phiên bản cấu hình/mã; **commit — mốc phiên bản Git** khác commit database ở mục 1. Ghi loại commit bạn nói đến để tránh nhập nhằng.

**Artifact — sản phẩm triển khai** gồm gói/file chương trình đúng phiên bản; **release — lần phát hành** kết hợp artifact, cấu hình và phiên bản schema. Một nhãn “v2” chưa đủ nếu mỗi máy cài file khác. Ghi checksum — dấu kiểm tra byte — hoặc mốc nguồn cùng cách build và các phụ thuộc. **Migration — bước đổi cấu trúc/nội dung dữ liệu** cần có điều kiện chạy và kiểm tra; rollback chương trình không tự đảo dữ liệu.

## 4. Các mốc thực hiện: biết khi nào được đi tiếp

### Mốc A — thiết kế và chuẩn bị đường phục hồi

Viết sơ đồ, bảng IP/port, dependency — các thành phần phụ thuộc — và **failure domain — phạm vi có thể hỏng cùng nhau**, như một host hoặc một ổ. Ghi tài nguyên máy thật và VM, dữ liệu sẽ nằm ở đâu, người quản trị lấy secret ở đâu và cách vào console — đường điều khiển VM không phụ thuộc SSH — khi mạng lỗi.

**Acceptance criteria — điều kiện nghiệm thu** là dấu hiệu cụ thể để kết luận mốc đạt. Mốc A đạt khi người khác đọc tài liệu biết client gọi đâu, app dùng database nào, nơi backup và cách kiểm chứng từng đường. Không coi một sơ đồ đẹp là kiểm tra mạng đã hoạt động.

### Mốc B — dựng baseline có lưu dữ liệu

**Baseline — trạng thái mốc được chấp nhận** là phiên bản/cấu hình/workload trước các thay đổi thử. Dựng app/database rồi proxy, theo đường dữ liệu trước khi thêm đo tải. Với **systemd — bộ quản lý dịch vụ** trên distro dùng nó, **unit — mô tả đối tượng quản lý** khai user, thư mục, lệnh chạy và vòng đời. Distro — bản phân phối — khác có thể dùng manager khác; ghi rõ công cụ thực tế.

Nghiệm thu theo thứ tự: tạo một đơn → đọc đúng ID/amount → khởi động lại app → đọc lại cùng đơn → khởi động lại VM theo kế hoạch lab → kiểm tra dịch vụ và dữ liệu. `enabled` của unit là cấu hình kích hoạt; `active` là trạng thái manager, cả hai không thay yêu cầu đọc đơn thật. **Graceful shutdown — dừng có phối hợp** cần ngừng nhận việc mới và xử lý việc dở trong thời hạn đã chọn; báo process thoát bình thường chưa chứng minh không mất request đang chạy.

### Mốc C — tự động hóa có thể dựng lại

**Automation — tự động hóa thao tác** biểu diễn cấu hình thành công việc có thể chạy lại. **Ansible inventory — danh sách máy đích/cách kết nối** chọn đúng VM; **playbook — mô tả tác vụ** dùng module — công cụ thực hiện loại việc — để đưa máy đến trạng thái mong muốn.

**Idempotency — áp dụng lại không tạo thay đổi vô nghĩa khi trạng thái đã đúng** phải được kiểm tra bằng lần chạy thứ hai và trạng thái thực. **Drift — sai lệch khỏi cấu hình chuẩn** được tạo bằng sửa một file lab rồi chạy lại để thấy công cụ đưa về đúng. `--check` dự báo theo hỗ trợ module; không tự thử chức năng hay bảo đảm mọi tác vụ đều không thực hiện. [Ansible check/diff mode](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_checkmode.html).

Nghiệm thu: dựng từ VM sạch hoặc bản clone đã biết trạng thái, không phụ thuộc file đã chép tay trước; chạy lại đúng cấu hình; kiểm tra API; tạo drift có kiểm soát rồi sửa; ghi phiên bản công cụ. Không cần ép `changed=0` nếu task đọc/khởi tạo thật có lý do riêng, nhưng phải giải thích và loại restart vô điều kiện không cần thiết.

### Mốc D — nhìn dịch vụ từ người dùng rồi đến thành phần

**Probe — yêu cầu kiểm tra chủ động** từ client lab gọi chức năng. **Log — nhật ký sự kiện** có timestamp — mốc ngày giờ — và ngữ cảnh. **Metric — số đo theo thời gian** cho mức dùng/xu hướng, như request/error/duration; **trace — dấu vết nối các đoạn xử lý của một request** giúp tìm chặng chậm nếu bạn triển khai nó.

Giữ log có thời gian và ID request khi phù hợp; metric dùng nhãn có số loại giới hạn, không tạo một chuỗi cho mọi ID đơn/người dùng. Đồ án cơ bản có thể dùng probe và log có cấu trúc để tính request/error/duration; nếu chưa triển khai trace, ghi rõ thay vì đặt mục “trace” rỗng như đã đo.

**SLI — chỉ số đo mức phục vụ** có định nghĩa tử/mẫu số; **SLO — mục tiêu SLI trên cửa sổ** được tự đặt cho đồ án. Ví dụ minh họa: mọi yêu cầu đọc hợp lệ được tính, tốt khi dữ liệu đúng, HTTP 200 và thời gian≤ngưỡng đã chọn. **Latency — thời gian từ mốc bắt đầu đến mốc phản hồi** cần cùng ranh giới; **p99 — phân vị 99%** phải ghi cách tính và số mẫu. 20 probe chỉ giúp thử cách tính, không chứng minh SLO tháng.

Nghiệm thu: probe ngoài app nhìn được lỗi backend, log có thể liên hệ đúng mốc/cấu hình, và bạn tính được số tốt/tổng từ dữ liệu thô. Một mẫu alert — cảnh báo — phải nêu triệu chứng, phạm vi, ngưỡng/cửa sổ, nơi xem bằng chứng và bước xử lý. Chưa thử đường nhận thông báo thì ghi rõ; không cần gửi thông báo tới hệ thật.

### Mốc E — backup và recovery thật sang đích mới

**Backup — bản sao phục vụ khôi phục** phải nhất quán theo phương pháp database. **Restore — dựng lại dữ liệu từ bản sao** là một bước của **recovery — phục hồi chức năng dịch vụ**. **RPO — mục tiêu mức dữ liệu có thể mất theo thời gian** và **RTO — mục tiêu thời gian phục hồi** phải có mốc đo/phạm vi rõ.

Chọn phương án PostgreSQL theo phiên bản và yêu cầu: dump logic bằng `pg_dump` hay quy trình vật lý/nhật ký phù hợp. Định dạng custom dùng `pg_restore`, SQL thuần dùng `psql`; dump một database không tự giữ mọi role/đối tượng chung. Không copy thư mục dữ liệu đang chạy như thay thế phương pháp được hỗ trợ. [PostgreSQL Backup and Restore](https://www.postgresql.org/docs/current/backup.html), [pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html).

Nghiệm thu: tạo các bản ghi đã biết → backup → lưu bản cùng thông tin phục hồi ngoài miền lỗi đã chọn → dựng VM/database đích mới → restore và dựng app trỏ đích mới → đọc các bản ghi, kiểm tra số lượng/tổng tiền/quyền. Đừng ghi đè database nguồn để “thử restore”. Điểm backup có thể thiếu các đơn tạo sau nó; đo và đối chiếu RPO, không đổi mục tiêu sau khi thấy thiếu dữ liệu.

Mục tiêu minh họa “phục hồi chức năng đọc đơn trong 30 phút” chỉ có nghĩa khi tính cả lấy bản sao/khóa, chuẩn bị đích, restore, cấu hình và kiểm tra. Thời gian `pg_restore` riêng không phải RTO toàn dịch vụ. Nếu kho nằm trên cùng host, ghi chưa bảo vệ trước mất host; cần một đích phù hợp miền lỗi muốn thử.

### Mốc F — đo hiệu năng và kiểm tra một thay đổi

**Workload — kiểu/lượng công việc** gồm dữ liệu, tỷ lệ đọc/ghi, số client và tốc độ gửi. **Concurrency — số công việc đang thực hiện đồng thời** khác request/giây. **Throughput — lượng công việc hoàn tất mỗi giây** khác tốc độ gửi khi lỗi/hàng đợi tăng. **Bottleneck — thành phần giới hạn mục tiêu đang đo** phải có bằng chứng, không chỉ tài nguyên trông bận nhất.

Ghi dataset — tập dữ liệu —, số bản ghi/kích thước, phiên bản, tài nguyên, thời lượng, warm-up — giai đoạn làm ổn định cache/kết nối nếu thiết kế có — và điểm đo. Thử tải nhỏ trước, tăng có hạn và theo dõi client lẫn server; công cụ tạo tải cũng có thể là nút thắt. Không tự retry POST khi đo nếu app chưa chống trùng.

Nghiệm thu: baseline lặp được → giả thuyết có thể bác bỏ → thay một biến → đo lại cùng workload → kiểm tra tính đúng dữ liệu → ghi kết luận và giới hạn. Ví dụ tăng worker — process/luồng xử lý — có thể giúp khi CPU còn chỗ nhưng cũng tăng kết nối database. Nếu kết quả không tốt hơn, giữ kết quả đó trong báo cáo; không xóa lượt bất lợi để chọn một con số đẹp.

### Mốc G — diễn tập lỗi, phục hồi và bàn giao

**Failure drill — diễn tập một lỗi được chủ động tạo trong lab** gồm trạng thái trước, thao tác gây lỗi, bằng chứng và phục hồi. **Runbook — hướng dẫn thao tác vận hành** ghi thứ tự, điều kiện, dấu đạt/lỗi và cách dừng. **Postmortem — báo cáo học từ sự cố** phân tích ảnh hưởng, bằng chứng, nguyên nhân/yếu tố góp phần và hành động cải thiện.

Thử một lỗi mỗi lượt trên VM/bản sao riêng, ghi timeline — chuỗi mốc thời gian — rồi đưa hệ về baseline có kiểm chứng. Bằng chứng không đủ thì kết luận chưa xác định, kèm phép đo tiếp; đừng gán nguyên nhân cho thay đổi gần nhất chỉ vì xảy ra gần nhau. [Google SRE: incident response](https://sre.google/workbook/incident-response/).

## 5. Lab nghiệm thu API: lệnh phải chứng minh được chức năng nào?

Phần này chỉ chạy **sau khi bạn đã triển khai hợp đồng ở mục 1** trên lab và có curl/Python 3. Nó không tự dựng ứng dụng/database. Dùng Bash, thay URL bằng proxy lab thật, chỉ tạo đơn giả; không dùng endpoint sản phẩm thật.

```bash
acceptance_dir=$(mktemp -d)
cd "$acceptance_dir" || exit 1
base_url='http://192.168.56.10:8081'
curl --noproxy '*' --silent --show-error --max-time 5 --fail \
    "$base_url/health/ready"
```

`mktemp -d` tạo thư mục mới tránh đè kết quả cũ; `--noproxy '*'` thử trực tiếp bỏ proxy từ biến môi trường của curl. `--max-time` giới hạn tổng thời gian; `--fail` làm nhiều lỗi HTTP thành mã lỗi công cụ. Chỉ đi tiếp khi đúng dịch vụ lab đã sẵn sàng. IP trong bài là minh họa; nếu khác hoặc chưa dựng được, dừng để sửa tiền đề. Đối chiếu tùy chọn qua [manual curl](https://curl.se/docs/manpage.html) của bản đang cài.

Tạo đơn, giữ body/mã HTTP và đọc ID từ JSON:

```bash
if http_code=$(curl --noproxy '*' --silent --show-error --max-time 5 \
    --output created.json --write-out '%{http_code}' \
    -H 'Content-Type: application/json' \
    --data '{"amount":100}' "$base_url/orders"); then
    transport_status=0
else
    transport_status=$?
fi
printf 'transport=%s HTTP=%s\n' "$transport_status" "$http_code"
cat created.json
```

**Header — trường thông tin đầu thông điệp** `Content-Type` nói body là JSON. `--data` gửi body và curl chọn POST trong trường hợp này. Mã thoát curl nói trao đổi đã hoàn tất theo công cụ, mã HTTP nói ứng dụng trả loại kết quả nào. Không dùng `--fail` ở bước này để giữ riêng hai lớp; cần `transport=0` và HTTP 201 mới đi tiếp. Timeout sau POST không chứng minh đơn chưa được tạo; đối chiếu dữ liệu trước khi gửi lại.

```bash
order_id=$(python3 - <<'PY'
import json
with open('created.json') as source:
    result = json.load(source)
value = result['id']
if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
    raise SystemExit('Expected a positive integer id according to the lab contract')
if result.get('amount') != 100:
    raise SystemExit('Unexpected amount')
print(value)
PY
) || exit 1
curl --noproxy '*' --silent --show-error --max-time 5 --fail \
    --output read.json "$base_url/orders/$order_id"
python3 - <<'PY'
import json
with open('created.json') as source:
    created = json.load(source)
with open('read.json') as source:
    read = json.load(source)
if read['id'] != created['id'] or read['amount'] != 100:
    raise SystemExit('Read result does not match the created order')
print('create/read content verified')
PY
```

Kiểm tra ID/amount mới chứng minh đọc lại đúng một đơn theo hợp đồng; HTTP 200 một mình có thể chứa nội dung sai. Sau khởi động lại app/VM theo runbook, dùng **cùng ID đã lưu** để đọc lại. Tạo đơn khác rồi đọc nó không kiểm tra dữ liệu cũ còn tồn tại.

Thử dữ liệu sai:

```bash
bad_code=$(curl --noproxy '*' --silent --show-error --max-time 5 \
    --output rejected.json --write-out '%{http_code}' \
    -H 'Content-Type: application/json' \
    --data '{"amount":-1}' "$base_url/orders")
printf 'invalid request HTTP=%s\n' "$bad_code"
cat rejected.json
```

Kỳ vọng 400 và nội dung lỗi theo hợp đồng. Kiểm tra thêm số bản ghi/nhật ký truy vấn phù hợp để xác nhận không tạo đơn cho yêu cầu bị từ chối. Lệnh chỉ kiểm tra một trường hợp, chưa bao phủ JSON hỏng, sai kiểu, giới hạn kích thước hay cạnh tranh; thêm các trường hợp ấy vào bài nộp.

Nếu chưa có app, bạn có thể kiểm tra cú pháp lệnh và bộ phân tích JSON với fixture — dữ liệu mẫu cố định — nhưng phải ghi chưa nghiệm thu API thật. Các kết quả kỳ vọng trong bài không được điền vào `evidence/` như số đo đã chạy.

## 6. Ma trận sự cố bắt buộc: tạo lỗi nào và nhìn vào đâu?

Trước mỗi lượt, ghi baseline, người thao tác, giới hạn thời gian, cách phục hồi, nơi console và tiêu chí dừng. Các bước tác động bên dưới là bài tập **trên VM đồ án riêng**, không áp dụng host đang dùng. Sau mỗi lượt, xác minh đọc đơn đúng qua proxy rồi mới thử lỗi tiếp.

Các thuật ngữ dưới đây giúp đọc ma trận và chọn đúng lớp bằng chứng:

**Drop-in — file bổ sung cấu hình một unit** phải có tên/đường dẫn riêng để gỡ đúng phần vừa thêm. **Journal — nhật ký manager thu** không tự chứa mọi log ứng dụng nếu chương trình ghi nơi khác. **Quota — hạn mức CPU** có thể làm app bị trì hoãn dù host còn rảnh; **throttle — tạm ngăn dùng CPU khi hết ngân sách** cần được đo bằng counter thay đổi trong đúng cgroup. **Cgroup — nhóm tiến trình được tính/điều khiển tài nguyên** có giới hạn cha cũng ảnh hưởng con. [Kernel cgroups v2](https://docs.kernel.org/admin-guide/cgroup-v2.html).

**DAC — quyền truy cập theo danh tính/chủ sở hữu**, **ACL — quyền bổ sung**, **MAC — chính sách truy cập bắt buộc** là các lớp khác nhau; lỗi DAC rõ không cần tắt SELinux/AppArmor. **FD — số nhận diện file đang mở của process** còn giữ đối tượng sau **unlink — xóa entry tên**; **filesystem — hệ tổ chức tệp** vẫn có thể giữ block dù `du` không thấy tên. **Inode — đối tượng thông tin file** có thể là tài nguyên hữu hạn, nên đọc cả `df -h` và `df -i` khi điều tra đầy.

| Tình huống | Tạo lỗi có giới hạn trong lab | Bằng chứng để phân biệt | Điều kiện phục hồi |
|---|---|---|---|
| Service không start | Thay WorkingDirectory của unit app bằng drop-in riêng | File cấu hình, `systemctl status`, journal, đường dẫn/permission | Gỡ đúng drop-in lab, đọc lại unit, start, đọc đơn qua proxy |
| Backend mất | Dừng app theo manager, không dừng database cùng lượt | Proxy còn listener, probe lỗi, error log kết nối upstream | Start app, readiness và đọc đúng đơn đã có |
| CPU throttle | Hạn quota của unit app thử theo bài 36 | `cpu.max`, delta `cpu.stat`, throughput/latency và host | Trả quota về baseline, đo lại cùng workload |
| Lỗi truy cập fixture | Bỏ quyền đọc một file thử mà app thật sự cần | UID/GID, đường dẫn, DAC/ACL, MAC nếu liên quan, log | Trả đúng mode đã ghi, thử bằng process/danh tính thật |
| Dung lượng khó giải thích | File 32 MiB đã unlink nhưng còn mở theo bài 39 | `/proc/PID/fd` hoặc lsof, delta df/du, link count | Process lab đóng FD, kiểm tra phần lưu trữ được giải phóng theo FS |
| Upstream/địa chỉ sai | Sửa một địa chỉ/hostname trong bản config proxy lab | Diff config, giải tên/route/listener, lỗi từng chặng | Quay file config đúng, kiểm tra cú pháp rồi áp lại, đọc đơn |
| Mất máy dữ liệu | Ngừng dùng DB VM nguồn trong lượt đã backup; dựng đích mới | Archive/chuỗi hợp lệ, bản ghi/tổng tiền, quyền và thời gian toàn tuyến | App trỏ đúng đích phục hồi, kiểm chứng chức năng, báo RPO/RTO |



Không tạo đầy filesystem root; nếu muốn thử đầy đĩa, dùng volume — vùng lưu trữ — lab riêng có hạn dung lượng và dữ liệu bỏ được. Không gây **kernel panic — lỗi khiến nhân không thể tiếp tục bình thường** trên host. Nhánh crash kernel chỉ ở VM chuyên dụng đã có console/kdump — cơ chế lưu ảnh nhớ nhân để điều tra — và quy trình bài 34; không bắt buộc cho đồ án cơ bản.

## 7. Đo thay đổi và rollback bằng bằng chứng nào?

**Rollback — quay về trạng thái trước thay đổi** cần chỉ rõ artifact, config và dữ liệu. **Abort — dừng mở rộng thay đổi** là quyết định khi điều kiện không đạt, chưa đồng nghĩa hệ đã quay lại. **Canary — triển khai một phần nhỏ để đánh giá trước mở rộng** cần đo riêng bản mới/cũ nếu có; nhìn số chung có thể che lỗi của phần nhỏ. [Google SRE: canarying releases](https://sre.google/workbook/canarying-releases/).

Đồ án chỉ có một App VM có thể dùng clone độc lập để thử phiên bản mới; ghi rõ đây là thử trước trên môi trường khác, chưa phải canary traffic của cùng hệ. Sau thử, áp release có kiểm soát và kiểm tra. Với hai bản app, ghi cách chia traffic và cách gỡ bản mới, cùng khả năng đọc/ghi dữ liệu chung.

Một runbook thay đổi phải chứa:

1. Release cũ/mới, cấu hình và schema; kết quả health/nghiệp vụ mốc trước.
2. Điểm backup đã restore thử, nơi lấy khóa/quyền; phạm vi mất dữ liệu nếu dùng điểm đó.
3. Thao tác triển khai, tiêu chí dừng theo lỗi/latency/dữ liệu và thời lượng quan sát.
4. Thao tác quay lại cụ thể, ai làm và cách xác nhận phục hồi.
5. Dữ liệu tạo trong lúc bản mới hoạt động được xử lý thế nào.

Ví dụ thay đổi chỉ cổng proxy có thể quay config cũ rồi nạp lại sau kiểm tra. Migration xóa cột mà bản cũ cần thì không thể hứa quay chương trình cũ là đủ. Thiết kế **expand/contract — thêm phần tương thích trước, thu gọn sau** có thể giữ một giai đoạn hai bản cùng đọc được, nhưng cần kiểm tra theo app; đừng restore backup cũ rồi lờ đi các đơn mới bị mất.

## 8. Hồ sơ bàn giao phải khiến người khác tự dựng được

Tạo bộ hồ sơ của đồ án; đây là cấu trúc **người học cần làm**, không phải các file đã có sẵn sau khi đọc bài:

```text
project/
  README.md                 # điều kiện, dựng/chạy, kiểm tra nhanh
  architecture.md           # vai trò, IP/port, đường dữ liệu, miền lỗi
  automation/               # playbook, template, inventory mẫu không secret
  app/                      # mã nguồn/phiên bản, API contract, migration
  runbooks/                 # deploy, rollback, restore, xử lý sự cố
  evidence/                 # log/số liệu thô đã loại secret, mốc phiên bản
  reports/                  # benchmark, restore drill, postmortem
```

**Evidence — bằng chứng** phải cho biết lệnh/đường đo, mốc thời gian, máy nào, phiên bản nào, workload nào và kết quả gốc. **Report — báo cáo phân tích** nối bằng chứng với kết luận; không thay dữ liệu gốc bằng một ảnh cắt mất dòng lỗi. Loại secret/dữ liệu nhạy cảm trước khi chia sẻ, nhưng ghi rõ phần bị loại để người đọc biết giới hạn đối chiếu.

Một bảng báo cáo tối thiểu:

| Báo cáo | Cần ghi | Điều không được suy ra từ một phép thử |
|---|---|---|
| Benchmark | Dataset, concurrency, thời lượng, client/server, p50/p99/max, lỗi, thay đổi | Một lần nhanh chứng minh mọi tải đều nhanh |
| Restore drill | Điểm dữ liệu, nơi bản sao, thao tác, đích mới, truy vấn nghiệp vụ, thời gian | Giải nén thành công chứng minh RTO dịch vụ |
| Incident/postmortem | Ảnh hưởng, timeline, giả thuyết, bằng chứng, giảm ảnh hưởng, điều chưa biết | Restart hết lỗi chứng minh nguyên nhân đã xác định |
| Deploy/rollback | Artifact/config/schema trước/sau, gate và dữ liệu mới | File cấu hình quay lại chứng minh mọi trạng thái quay lại |

**p50 — phân vị 50%** là mốc giữa theo phương pháp chọn mẫu, còn **max** là mẫu lớn nhất quan sát, không là cận tuyệt đối. Ghi đủ số mẫu và cách tính; nếu không đủ dữ liệu cho kết luận, viết rõ và đề xuất phép đo tiếp.

## 9. Rubric đánh giá: điểm số phải gắn với dấu nghiệm thu

**Rubric — bảng tiêu chí chấm** giúp người học tự đối chiếu. Tổng 100 điểm là quy ước đồ án, không chứng nhận chức danh nghề nghiệp.

| Nhóm | Điểm tối đa | Dấu đạt cụ thể |
|---|---:|---|
| Hiểu cơ chế | 20 | Vẽ và giải thích boot/process/CPU/memory/network/storage của hệ đã dựng, nêu ranh giới số đo |
| Tái tạo và automation | 20 | Dựng đích sạch từ tài liệu; lần chạy lại có lý do changed rõ; drift được sửa và chức năng vẫn đúng |
| Vận hành/bảo mật | 20 | Danh tính/quyền hẹp, secret ngoài hồ sơ, health/log, khởi động và cập nhật có đường phục hồi |
| Điều tra và hiệu năng | 20 | Giả thuyết kiểm chứng được, số đo cùng workload, lỗi và thay đổi không hiệu quả vẫn được giữ |
| Restore và bàn giao | 20 | Restore vào đích mới thật, kiểm tra dữ liệu/nghiệp vụ, RPO/RTO có mốc, runbook người khác làm được |

Có thể tự chia mỗi nhóm thành bốn tiêu chí 5 điểm: đạt đủ bằng chứng nhận 5, chỉ kế hoạch/minh họa nhận tối đa phần điểm bạn quy định trước, không có bằng chứng thì không tự chấm như đã làm. Gợi ý hoàn thành từ 80/100 **và** bắt buộc restore thật thành công, không đưa secret vào artifact bàn giao, có bằng chứng phục hồi các lỗi đã chọn.

Nếu không có tài nguyên để thử đủ ba VM hoặc một nhánh quyền cao, báo phần chưa thực hiện và giới hạn. Tài liệu tốt không biến bước chưa làm thành đã làm; người hướng dẫn có thể điều chỉnh phạm vi đồ án trước khi chấm.

## 10. Lỗi thường gặp và tự bảo vệ quyết định kỹ thuật

| Vấn đề | Hướng kiểm tra |
|---|---|
| API health 200 nhưng tạo đơn lỗi | Readiness kiểm tra gì, quyền/kết nối DB, transaction và log của request thật |
| Proxy truy cập được nhưng app/db lộ ra mạng không cần | Listener, địa chỉ, route/firewall từ từng nguồn, cấu hình manager sở hữu |
| CPU host thấp nhưng app chậm | Quota/CPU được phép, chờ khóa, DB/network/storage, số đo trong VM/cgroup |
| Tăng app replica làm lỗi DB tăng | Pool kết nối, DB capacity, request/transaction mỗi giây và đường chờ |
| Sau reboot đơn cũ biến mất | Dữ liệu có ở vùng bền không, app trỏ DB nào, volume và cấu hình khởi động |
| Backup xanh nhưng restore thiếu quyền/chức năng | Phạm vi role/config/secret, phiên bản công cụ, kiểm tra nghiệp vụ trên đích |
| Rollback “thành công” nhưng bản cũ không chạy | Schema/dữ liệu đã đổi, cấu hình hiệu lực và artifact thực tế |
| Báo cáo chỉ chứa lượt tốt nhất | Giữ các lượt, điều kiện khác nhau, lỗi và giả thuyết bị bác bỏ |

Trả lời các câu bảo vệ sau bằng bằng chứng hệ của bạn, không chỉ định nghĩa:

1. Proxy và app cùng host chết: dự phòng hiện tại giúp gì? **Đối chiếu:** phân biệt lỗi process/VM với mất host; chỉ ra thành phần/bản sao còn sống thật.
2. App latency cao khi host CPU thấp: đo gì trước? **Đối chiếu:** giới hạn và CPU runnable của app, thời gian chờ khóa/I/O/upstream; phép đo phải đúng cgroup/VM và ranh giới.
3. Dữ liệu được coi bền tại điểm nào? **Đối chiếu:** thời điểm commit/trả thành công, cấu hình DB/storage, phạm vi backup và phép restore đã thử; không dùng một fsync mẫu thay giao thức app.
4. Thêm vCPU, replica hoặc đổi scheduler: bằng chứng nào khiến chọn? **Đối chiếu:** biết thiếu CPU, khả năng song song, giới hạn host/DB và phép thử một biến; tên công cụ không là lý do.
5. Bản cũ không đọc schema mới thì rollback ra sao? **Đối chiếu:** có tương thích đã thử hoặc kế hoạch recovery/tiến lên sửa, xét cả dữ liệu mới và RPO.
6. RTO mục tiêu 30 phút, restore SQL 5 phút nhưng dựng máy/lấy khóa/kiểm tra 40 phút: đạt chưa? **Đối chiếu:** chưa nếu mục tiêu là toàn chức năng; phải tính đủ các đoạn.
7. Chạy lại playbook changed=0 nhưng HTTP lỗi: nghiệm thu automation đạt chưa? **Đối chiếu:** trạng thái mô tả có thể đúng trong khi chức năng sai; cần health/nghiệp vụ và cấu hình mong muốn hợp lệ.
8. Một lần không gặp lỗi trong 20 request có chứng minh SLO 99,9% tháng? **Đối chiếu:** không; thiếu số mẫu/cửa sổ/tải đại diện và định nghĩa phù hợp.

**Tự nhắc lại:** bắt đầu bằng hợp đồng nghiệp vụ, chia vai trò và ranh giới, dựng baseline có dữ liệu, tự động hóa, quan sát, thử phục hồi, đo thay đổi rồi bàn giao bằng bằng chứng. Kết thúc đồ án, chọn nhánh học tiếp từ điểm yếu thực tế: vận hành SRE/platform, storage/network, embedded Linux hoặc phát triển kernel. **SRE — kỹ thuật độ tin cậy dịch vụ** và **platform — nền tảng dùng chung để dựng/vận hành ứng dụng** là hai hướng ứng dụng kiến thức; tên hướng không thay cho kỹ năng và bằng chứng.

## Nguồn đối chiếu và phạm vi

- [Google SRE Workbook](https://sre.google/workbook/table-of-contents/), [incident response](https://sre.google/workbook/incident-response/), [canarying releases](https://sre.google/workbook/canarying-releases/): so sánh phương pháp vận hành/thay đổi với thiết kế đồ án, không sao chép mục tiêu của hệ khác.
- [Nginx proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html), [Ansible check/diff](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_checkmode.html): ranh giới proxy và dự báo tự động hóa; dùng manual khớp bản cài.
- [PostgreSQL CREATE TABLE](https://www.postgresql.org/docs/current/sql-createtable.html), [backup](https://www.postgresql.org/docs/current/backup.html), [pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html): dữ liệu và phục hồi; đường `current` thay theo bản ổn định, chọn nhánh đúng server/công cụ.
- [Kernel cgroups v2](https://docs.kernel.org/admin-guide/cgroup-v2.html): CPU/memory trong phạm vi nhóm; sysstat, tracing, VM và build kernel được dẫn nguồn cụ thể ở bài 31–39.

Các hợp đồng, IP và mục tiêu trong bài là mẫu thiết kế đồ án. Không có kết quả benchmark, restore VM hay diễn tập sự cố được coi là đã thực hiện chỉ vì xuất hiện trong bảng.
