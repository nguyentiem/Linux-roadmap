# Bài 39 — Thiết kế và xử lý sự cố ở mức senior

[Mục lục](../README.md) · [← Bài 38](38-build-kernel.md) · [Bài 40 →](40-do-an-tong-hop.md)

## Mục tiêu: có bằng chứng, phục hồi được, rồi ngăn tái diễn

Một dịch vụ web trả lỗi, tải máy tăng và chỗ lưu sắp hết. Nếu lập tức restart mọi chương trình, bạn có thể vừa mất bằng chứng vừa gây thêm gián đoạn mà chưa biết lỗi ở đâu. Năng lực xử lý sự cố không đo bằng số lệnh nhớ được, mà bằng cách nối biểu hiện với giả thuyết, thử có phạm vi và xác minh kết quả.

**Incident — sự cố vận hành** là tình trạng ảnh hưởng chức năng hoặc mức phục vụ cần có. **Troubleshooting — điều tra và xử lý lỗi** dùng bằng chứng để phân biệt nguyên nhân có thể. **Senior — mức làm việc có trách nhiệm hệ thống** ở đây nhấn mạnh quyết định có căn cứ, giới hạn ảnh hưởng và cải tiến sau sự cố, không là một bộ lệnh riêng.

Sau bài này, bạn cần vẽ miền hỏng, lập kế hoạch tài nguyên có dự phòng, giữ timeline/bằng chứng, xử lý một file đã xóa vẫn mở và viết postmortem có hành động kiểm chứng. Cần bài 29–38. Lab chính chỉ tạo tối đa 32 MiB file trong thư mục tạm rồi đóng lại theo thời hạn; không cố làm đầy disk host, không restart dịch vụ host và không gửi thông báo thật.

## 1. Bắt đầu từ đường yêu cầu hay từ một con số đỏ?

**Request — yêu cầu** là một lần người dùng/chương trình xin hệ thống làm việc. **Response — phản hồi** là kết quả nhận được. **Proxy — thành phần chuyển tiếp** nhận rồi gửi request tới **backend — thành phần xử lý phía sau**. **Database — hệ quản lý dữ liệu** phục vụ lưu/truy vấn. **Dependency — phụ thuộc** là thành phần khác mà một chức năng cần.

Vẽ hai đường trước: đường request chỉ ai chờ ai, đường dữ liệu chỉ ai ghi/đọc ở đâu. Ví dụ khái niệm:

```text
Người dùng → Proxy → App A hoặc App B → Database
                          |                 |
                          v                 v
                    log ứng dụng       dữ liệu bền
                          \                 /
                           cùng storage host
```

Mũi tên trên là quan hệ xử lý; hai nhánh dưới cho thấy app/log và database có thể cùng phụ thuộc storage. Một ổ hỏng có thể ảnh hưởng nhiều thành phần tưởng là riêng. **Storage — hệ lưu trữ** có thể là ổ vật lý, mảng đĩa, filesystem hoặc dịch vụ lưu trên mạng; cần xác định tầng cụ thể.

**Instance — một bản dịch vụ đang chạy** và **replica — bản phục vụ/nhân bản theo thiết kế** không tự là tài nguyên độc lập. **Host — máy/hệ chủ** có thể chứa nhiều process/VM; **VM — máy ảo** có kernel riêng nhưng vẫn dùng tài nguyên host. **Failure domain — miền có thể hỏng chung** là tập thành phần bị cùng một sự cố ảnh hưởng: host, nguồn điện, mạng, storage hoặc vùng triển khai.

**HA — high availability, khả năng duy trì phục vụ cao** giảm một số điểm hỏng qua nhiều bản và đường chuyển phù hợp; không là lời bảo đảm không có sự cố. **Replication — nhân bản dữ liệu/thay đổi** có thể nhân cả lỗi xóa/sửa. **Backup — bản sao phục hồi** phải giữ trạng thái cần lấy lại và sống được qua miền hỏng mục tiêu. Hai VM trên cùng storage không độc lập trước lỗi storage; replication không thay backup cho dữ liệu bị sửa sai.

Tự kiểm tra mô hình: với mỗi cặp replica, hỏi “chúng cùng host, disk, mạng, quyền quản trị hoặc nguồn nào?”. Nếu câu trả lời có cùng thành phần, ghi đó là miền hỏng còn tồn tại, không chỉ vẽ hai hộp đẹp.

## 2. Tài nguyên dư hôm nay có đủ khi một phần hệ bị mất?

**Capacity planning — lập kế hoạch năng lực phục vụ** dựa trên loại/tần suất công việc, mức đỉnh, tăng trưởng và thời gian bổ sung tài nguyên. **Workload — khối lượng và cách công việc chạy** gồm loại request, mức song song, kích thước dữ liệu và phụ thuộc. **Peak — mức đỉnh** có thể khác trung bình ngày rất nhiều.

**Bottleneck — điểm giới hạn năng lực** là tài nguyên/đường xử lý làm tổng hệ không tăng tiếp dù thêm phần khác. **Headroom — phần dự phòng** giúp chịu tăng tải hoặc mất thành phần. **Connection pool — nhóm kết nối được tái sử dụng** hạn chế số kết nối đồng thời tới database; tăng app replica có thể tăng tổng kết nối, chuyển nghẽn xuống database thay vì giải quyết.

Một phép tính **minh họa**, không là năng lực đo của server thật:

- Mỗi instance chịu tối đa 1.000 request/giây trong điều kiện thử đại diện.
- Muốn vận hành ở tối đa 70% mức ấy, dùng năng lực kế hoạch 700 request/giây mỗi instance.
- Tải đỉnh dự kiến 6.000 request/giây; muốn chịu mất một instance.
- Với 10 instance, còn 9 × 700 = 6.300 request/giây theo mô hình, đủ điều kiện số học. Với 9 instance, mất một chỉ còn 8 × 700 = 5.600, không đủ.

Phép tính cần giả định cân bằng tải tốt, năng lực gần tuyến tính và dependency còn đủ. **Throughput — thông lượng** request/giây phải đi kèm tiêu chí lỗi/độ trễ; benchmark đạt 1.000 request/giây nhưng vi phạm thời gian phản hồi không là năng lực hợp lệ cho SLO.

**SLO — mục tiêu phục vụ** trên một cửa sổ, đo qua **SLI — chỉ số phục vụ có định nghĩa** như tỷ lệ request hợp lệ đúng hạn. Có headroom CPU không tự chứng minh đủ disk, RAM, kết nối hoặc quota. **Quota — hạn mức tài nguyên** có thể làm nhóm bị chặn dù host còn phần trống. [Google SRE về overload](https://sre.google/sre-book/handling-overload/).

Để bảo vệ quyết định thêm tài nguyên, cần đo tăng tài nguyên làm SLI tốt hơn trong cùng tải và phụ thuộc. Để bảo vệ quyết định sửa phần mềm, cần chứng minh thay đổi giảm công việc thừa/chờ hoặc chi phí trên request. Không mặc định thêm replica luôn tốt, cũng không mặc định tối ưu mã luôn rẻ hơn mở rộng.

## 3. Trong sự cố, thứ tự nào vừa giảm ảnh hưởng vừa giữ bằng chứng?

**Symptom — biểu hiện** là điều quan sát như lỗi 502 tăng; **hypothesis — giả thuyết** là giải thích có thể thử; **evidence — bằng chứng** là dữ liệu giúp ủng hộ hoặc bác bỏ; **cause — nguyên nhân** cần đủ chứng cứ, không chỉ xuất hiện gần nhau về thời gian.

**Timeline — dòng thời gian** nối các mốc với nguồn dữ liệu. **Log — nhật ký sự kiện**, **metric — số đo tổng hợp theo thời gian** và **trace — dấu vết các bước của request** cung cấp những góc khác nhau theo bài 29. **Timestamp — mốc ngày giờ** cần timezone và độ lệch đồng hồ được hiểu; không ghép log nhiều máy bằng thứ tự dòng đơn giản.

Quy trình dưới đây là khung để đưa ra hành động cụ thể, không đòi làm đủ mọi bước mới giảm ảnh hưởng:

1. **Xác nhận phạm vi:** ai bị lỗi, chức năng nào, từ khi nào, liên tục hay từng lúc? Dùng request thật/probe và SLI, không chỉ báo process active.
2. **Lập giả thuyết cạnh tranh:** xem thay đổi gần mốc lỗi nhưng chưa kết luận nó là nguyên nhân. Ghi bằng chứng nào sẽ phân biệt các giả thuyết.
3. **Giảm ảnh hưởng có kiểm soát:** giảm tải, chuyển phần request hoặc quay cấu hình tương thích khi đã xác định phạm vi/tác động. **Mitigation — giảm tác động** có thể phục hồi phục vụ trước khi biết đủ nguyên nhân.
4. **Giữ bằng chứng cần thiết:** log/metric, phiên bản/config, tiến trình, socket, cgroup và timeline; lấy ảnh chụp phù hợp trước restart nếu không làm kéo dài ảnh hưởng quá mức.
5. **Xác minh phục hồi:** cùng probe/SLI ban đầu cho thấy người dùng được phục vụ; tiếp tục quan sát qua cửa sổ phù hợp, không chỉ một request thành công.
6. **Điều tra và cải tiến:** nguyên nhân đã chứng minh, yếu tố góp phần, điều chưa biết, hành động có người phụ trách và cách kiểm chứng.

**Rollback — quay về trạng thái trước** cần biết bản nào tốt, dữ liệu còn tương thích và cách áp dụng. Restart có thể xóa trạng thái trong RAM, đóng file đang giữ và đặt lại **counter — bộ đếm tích lũy**; đó vừa có thể giúp giảm lỗi vừa làm mất bằng chứng. Hành động cần ghi thời điểm/tác động, không xem restart là chẩn đoán tự đủ.

Trong hệ có người vận hành, cần người điều phối, người xử lý kỹ thuật và người giữ thông tin; ở lab bạn tự đóng các vai trò bằng ghi chép. Không cần gửi email/chat hay kích hoạt cảnh báo thật. [Managing incidents](https://sre.google/sre-book/managing-incidents/).

## 4. Vì sao file đã xóa mà dung lượng chưa về?

### 4.1. Tên file không phải toàn bộ vòng đời dữ liệu

**Filesystem — hệ tổ chức tệp** nối tên trong thư mục với thông tin và dữ liệu. **Inode — bản ghi của một đối tượng file** trên nhiều filesystem Linux giữ thông tin như quyền/kích thước và liên hệ dữ liệu. **Directory entry — mục tên trong thư mục** là một tên trỏ đến đối tượng; một inode có thể có nhiều tên qua **hard link — liên kết cứng**.

**Process — tiến trình** là chương trình đang hoạt động. **File descriptor — số tham chiếu tệp mở**, viết FD, là số trong process giúp dùng đối tượng đang mở; FD không bắt buộc đi tìm lại tên mỗi lần đọc/ghi. **Unlink — gỡ một tên file** bỏ liên hệ tên khỏi thư mục. Nếu còn tên khác hoặc tham chiếu mở, đối tượng có thể còn tồn tại. [unlink(2)](https://man7.org/linux/man-pages/man2/unlink.2.html).

```text
Trước unlink:
  tên deleted-open.bin → inode/dữ liệu ← FD của process

Sau unlink tên cuối:
  tên không còn trong thư mục          inode/dữ liệu ← FD còn mở

Sau đóng tham chiếu mở cuối cùng:
  không còn tên, không còn tham chiếu → dữ liệu đủ điều kiện giải phóng
```

Đọc từng hàng: xóa tên không lấy FD của process đi. Với dữ liệu không còn tham chiếu, filesystem có thể giải phóng theo cơ chế của nó; **Snapshot — ảnh trạng thái tại một mốc theo cơ chế lưu trữ** hoặc lớp COW có thể còn giữ dữ liệu, nên không hứa luôn thấy đúng delta ngay.

**df** báo mức dung lượng theo filesystem; **du** cộng chỗ dùng của các đối tượng nó đi qua cây tên đã chọn. File đã unlink không còn tên để `du` thông thường đi tới, trong khi block vẫn có thể tính là dùng trong `df`. `df−du` không tự chứng minh deleted-open: còn phạm vi mount, quyền đọc, metadata, snapshot, sparse file và các tài nguyên khác.

**Mount — gắn filesystem vào thư mục** làm dữ liệu của vùng ấy xuất hiện ở điểm gắn; nếu `df` và `du` nhìn hai phạm vi khác nhau, so hiệu không có nghĩa như bạn nghĩ. **COW — sao chép khi ghi** và snapshot có thể giữ phiên bản cũ, nên chỗ thực dùng không luôn bằng kích thước file logic.

### 4.2. Không cần lấp đầy disk để thấy cơ chế

Lab dùng 32 **MiB — mebibyte**, với 1 MiB = 2^20 byte. Nó kiểm tra tên, FD và inode trực tiếp; không cần dùng hết dung lượng để có `No space left on device`. Mọi file thuộc thư mục mới, thời gian giữ sau unlink tối đa 30 giây, không giết tiến trình ngoài lab.

## 5. Lab: deleted-open file có giới hạn dung lượng và thời gian

### 5.1. Chuẩn bị script và chạy trong thư mục riêng

Điều kiện: Linux thử/VM, Bash, Python 3, `/proc` có thể đọc tiến trình của mình; `lsof` là tùy chọn. **Procfs — cây thông tin do kernel cung cấp** dưới `/proc` cho xem tiến trình; `/proc/PID/fd/N` biểu diễn FD N của process PID. **Kernel — nhân** quản lý vòng đời đối tượng file và tham chiếu ấy.

```bash
lab_dir=$(mktemp -d)
printf 'Lab directory: %s\n' "$lab_dir"
cd "$lab_dir" || exit 1
```

Lưu `hold_deleted.py`:

```python
import json
import os
from pathlib import Path
import sys
import time

root = Path(sys.argv[1]).resolve()
# Tránh tạo tải khi filesystem gần hết chỗ; vẫn không là đặt chỗ độc quyền.
stat = os.statvfs(root)
if stat.f_bavail * stat.f_frsize < 128 * 1024 * 1024:
    raise SystemExit('Need at least 128 MiB available for this bounded lab')
path = root / 'deleted-open.bin'
with path.open('xb') as file:
    for _ in range(32):
        file.write(b'x' * (1024 * 1024))
    file.flush()
    os.fsync(file.fileno())
    before = os.fstat(file.fileno())
    path.unlink()
    state = {
        'pid': os.getpid(), 'fd': file.fileno(), 'path': str(path),
        'size': before.st_size, 'inode': before.st_ino,
        'nlink_after_unlink': os.fstat(file.fileno()).st_nlink
    }
    (root / 'ready.json').write_text(json.dumps(state))
    print(state, flush=True)
    limit = time.monotonic() + 30
    while time.monotonic() < limit and not (root / 'release').exists():
        time.sleep(0.1)
print('FD closed; process exiting', flush=True)
```

`xb` tạo file mới độc quyền, lỗi nếu đã có thay vì ghi đè. `fsync` yêu cầu đồng bộ file theo cơ chế hệ; không là chứng nhận độ bền toàn storage. `fstat` hỏi chính đối tượng qua FD, nên vẫn đọc được inode/kích thước sau mất tên. `ready.json` giữ thông tin để shell biết kiểm tra ai. Tệp `release` yêu cầu kết thúc sớm; quá 30 giây trong đoạn chờ sau khi unlink thì tự đóng FD. Đây không phải cận tổng thời gian chạy: bước ghi/fsync trước đó có thể lâu hơn nếu storage chậm.

### 5.2. Giữ đúng PID, xem tên và FD, rồi đóng

```bash
python3 hold_deleted.py "$lab_dir" > holder.log 2> holder-errors.log &
holder_pid=$!
trap 'kill "$holder_pid" 2>/dev/null || true; wait "$holder_pid" 2>/dev/null || true' EXIT
for _ in {1..50}; do
    [[ -s ready.json ]] && break
    sleep 0.1
done
if [[ ! -s ready.json ]]; then cat holder-errors.log; exit 1; fi
cat ready.json
holder_fd=$(python3 -c 'import json; print(json.load(open("ready.json"))["fd"])')
test ! -e deleted-open.bin
readlink "/proc/$holder_pid/fd/$holder_fd"
stat -L -c 'size=%s inode=%i links=%h' "/proc/$holder_pid/fd/$holder_fd"
du -sh "$lab_dir"
df -h "$lab_dir"
# Nếu lsof đã cài, chỉ xem process của lab.
if command -v lsof >/dev/null; then lsof -a -p "$holder_pid" +L1; fi
touch release
wait "$holder_pid"
trap - EXIT
cat holder.log
```

`$!` lưu PID Python vừa chạy nền; không phải wrapper khác. **Trap — hành động khi shell có sự kiện** dọn đúng process nếu thoát sớm. `readlink` đọc mục `/proc/.../fd` thường có hậu tố `(deleted)`; `stat -L` đi theo mục ấy để hỏi file. `lsof — liệt kê file đang mở` với `+L1` chọn đối tượng có số liên kết dưới 1, `-a -p` giao điều kiện với PID cụ thể; không quét/giết hàng loạt. [Proc FD](https://man7.org/linux/man-pages/man5/proc_pid_fd.5.html), [lsof manual](https://man7.org/linux/man-pages/man8/lsof.8.html).

Cách đọc kết quả dự kiến:

- `test ! -e` đạt: tên đã mất khỏi thư mục, không phải file chưa từng được tạo.
- `ready.json`: size=33.554.432 byte, `nlink_after_unlink=0` và inode cụ thể của lần chạy.
- `stat -L`: kích thước tương ứng, links 0; FD vẫn tới được đối tượng dù tên mất.
- `du` thư mục thường nhỏ hơn 32 MiB vì chỉ còn script/metadata/log có tên; không là tổng mọi block của filesystem.
- `lsof` nếu có có thể báo FD kiểu 3w, NLINK 0 và `(deleted)`; FD/inode/PID thực thay đổi theo lần chạy.
- Sau `touch release`/`wait`, log có `FD closed`; process kết thúc, đường FD không còn đọc được.

`df` trên filesystem lớn/bận có thể không thấy thay đổi dễ đọc 32 MiB; không ép con số vì làm tròn, hoạt động khác, COW/snapshot và accounting. Cơ chế được chứng minh trực tiếp bằng tên mất, nlink=0 và FD còn mở. Nếu script tự hết hạn trước kiểm tra, đường `/proc` biến mất; chạy lại thư mục mới hoặc kiểm tra nhanh hơn, không tăng vô hạn thời gian giữ.

### 5.3. Khi gặp trên dịch vụ thật, xử lý khác lab thế nào?

File log bị unlink có thể vẫn được dịch vụ giữ để ghi. Xác định PID/FD và loại file trước, xem cơ chế **reopen log — đóng/mở lại nhật ký** của ứng dụng hoặc kế hoạch restart được phép. **Log rotation — luân phiên file log** cần phối hợp cách ứng dụng mở lại file; chỉ xóa tên không buộc nó đổi FD.

Không ghi bừa vào `/proc/PID/fd/N` để làm rỗng mọi file: có thể phá dữ liệu đang dùng. Không dùng `killall` để giải phóng chỗ. Nếu cần dữ liệu cho điều tra, bảo toàn theo quyền và quy trình trước khi đóng đối tượng cuối. Lab 32 MiB không chứng minh mọi trường hợp `df` lệch `du` đều cùng nguyên nhân.

## 6. Proxy 502, load cao và disk gần đầy: ít nhất ba giả thuyết

**HTTP 502 — Bad Gateway** thường nghĩa thành phần trung gian nhận phản hồi không hợp lệ từ upstream trong vai trò của nó, nhưng lý do cụ thể cần log/cấu hình. **Upstream — thành phần phía sau mà proxy chuyển tới** phải đúng địa chỉ/cổng/giao thức. **Load average — số đo công việc đang cần CPU hoặc ở một số trạng thái chờ không ngắt được trên Linux** không là phần trăm CPU; load cao có thể liên quan I/O.

Ba giả thuyết cần phép thử phân biệt:

| Giả thuyết | Bằng chứng có thể ủng hộ | Điều có thể bác bỏ/định hướng khác |
|---|---|---|
| Backend không phục vụ vì không ghi được file | Log báo hết chỗ/quota/quyền; chức năng ghi cụ thể thất bại | Backend vẫn trả chức năng ấy bình thường, filesystem đúng còn đủ và không có lỗi ghi |
| Backend chạy nhưng bị quota/chờ/timeout | Request trực tiếp chậm, cgroup có throttling, trace/metric chỉ chờ | Trực tiếp nhanh ổn còn proxy luôn lỗi với cùng route |
| Proxy trỏ sai upstream hoặc sai giao thức | Log kết nối/tên host lỗi, địa chỉ cấu hình khác listener | Cấu hình hiệu lực đúng và đường kết nối của proxy đến backend đã xác nhận |

**Cgroup — nhóm kiểm soát tài nguyên** có thể giới hạn CPU/RAM/I/O; **throttling — tạm ngăn dùng tiếp vì hết ngân sách** khác CPU host không còn tài nguyên. File `cpu.stat` ở cgroup v2 có các trường liên quan, nhưng phải đọc đúng nhóm của process và chênh lệch qua khoảng đo, không chỉ có counter > 0. [Cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html).

Các lệnh sau là ví dụ đọc trong lab đã có proxy/backend, thay địa chỉ/unit phù hợp; không tự chứng minh kết luận bằng một dòng:

```bash
curl --noproxy '*' --silent --show-error --max-time 2 \
    --output /dev/null --write-out 'HTTP=%{http_code} seconds=%{time_total}\n' \
    http://127.0.0.1:18080/
ss -lntp
df -h /duong/dan/du-lieu
df -i /duong/dan/du-lieu
```

`curl` trực tiếp cần gọi đúng route/phương thức/nội dung mà proxy gặp; root `/` khỏe không phủ nhận route `/api` lỗi. Mã thoát 0 không luôn nghĩa HTTP thành công nếu không dùng fail; đọc cả status và lỗi vận chuyển. `ss` đọc listener; quyền có thể hạn chế thấy process. `df -h` xem dung lượng, `df -i` xem inode khi filesystem có nghĩa phù hợp. **Inode** hết có thể chặn tạo file dù byte còn; quota/quyền cũng có thể làm ghi lỗi khi filesystem còn chỗ.

Tạo một lỗi mỗi lượt trên VM/fixture riêng đã học, ghi timestamp và phục hồi baseline — trạng thái chuẩn — sau mỗi lượt. Muốn mô phỏng disk đầy dùng vùng lưu thử có giới hạn được tạo đúng bài, không ghi tới đầy filesystem root host. Trong vòng đầu không tạo đồng thời ba lỗi: bạn sẽ khó biết thao tác nào giải quyết gì.

## 7. Evidence bundle cần gì để người khác kiểm tra lại?

**Evidence bundle — gói bằng chứng** là tập dữ liệu có nguồn/thời điểm/phạm vi đủ để người khác hiểu điều tra. Nó có thể chứa thông tin nhạy cảm, nên **permission — quyền đọc/ghi** phải phù hợp; không đẩy toàn log/secret lên kho công khai.

Một cấu trúc mẫu, chỉ tạo trong thư mục riêng nếu cần:

```text
incident-lab/
  timeline.md       mốc UTC, hành động, nguồn bằng chứng
  hypotheses.md    giả thuyết, phép thử, kết quả, mức chắc chắn
  versions.txt     công cụ/kernel/config thực đang dùng
  probe.tsv        request/status/duration/exit theo định nghĩa
  logs/            phần log cần thiết, đã bảo vệ/lọc bí mật phù hợp
  observations/    chụp trạng thái có thời điểm và lệnh tạo
  postmortem.md    kết luận, phần chưa biết, hành động kiểm chứng
```

**UTC** là mốc giờ chuẩn để nối timeline; vẫn ghi độ lệch đồng hồ nếu chưa đồng bộ. **Monotonic clock — đồng hồ tăng đơn điệu** dùng đo khoảng trên cùng máy, không trừ giá trị giữa hai máy tùy ý. **Version — phiên bản** phải phân biệt phần đã cài với phần đang chạy như các bài trước.

Ghi lệnh và output liên quan, không chỉ ảnh chụp con số không có đơn vị. Một biểu đồ cần biết cửa sổ, query và kiểu tổng hợp; một log cần biết nguồn/retention/timezone. **Retention — thời hạn giữ dữ liệu** giải thích tại sao dữ liệu cũ có thể không còn, không tự nghĩa sự kiện không xảy ra.

## 8. Postmortem nên giải thích cơ chế, không dừng ở người bấm sai

**Postmortem — phân tích sau sự cố** ghi tác động, diễn biến, nguyên nhân và cải tiến; **blameless — không quy tội cá nhân** nhằm tìm điều kiện hệ thống khiến quyết định có thể xảy ra và lọt qua kiểm soát. Không có nghĩa bỏ trách nhiệm hoặc bỏ bằng chứng. [SRE postmortem culture](https://sre.google/sre-book/postmortem-culture/).

Mẫu để điền bằng dữ liệu thật/fixture:

```text
Ảnh hưởng và khoảng thời gian:
SLI bị ảnh hưởng, định nghĩa và phạm vi người dùng:
Timeline kèm nguồn bằng chứng:
Cơ chế nguyên nhân đã chứng minh:
Yếu tố góp phần:
Biện pháp giảm tác động và kết quả đo:
Điều chưa biết / giả thuyết chưa loại trừ:
Hành động phòng ngừa, người phụ trách, hạn hoàn thành:
Phép kiểm chứng hành động và tiêu chí đạt:
Miền hỏng còn tồn tại / rủi ro đã chấp nhận:
```

Ví dụ minh họa: “người sửa sai upstream” chưa đủ. Hỏi vì sao địa chỉ sai được chấp nhận, kiểm tra chỉ cú pháp hay có health đúng route, rollout có canary không, vì sao alert không thấy và rollback có tương thích dữ liệu không. **Canary — đích thử trước khi mở rộng** giới hạn ảnh hưởng nhưng cần probe có ý nghĩa; có canary mà không đo chức năng lỗi vẫn có thể lọt.

Một hành động cụ thể hơn “cẩn thận hơn”: thêm kiểm tra kết nối/route upstream trên clone, triển khai một instance trước, chỉ mở rộng khi SLI đạt trong cửa sổ định trước; giao người phụ trách và thử lại chính lỗi fixture để xác nhận chặn được. Không nhất thiết mọi incident có một **root cause — nguyên nhân gốc** đơn lẻ; có thể là chuỗi điều kiện kết hợp.

**Runbook — hướng dẫn thao tác cho tình huống vận hành** nên nêu nhận diện, kiểm tra, hành động, rollback và cách xác nhận. Cập nhật runbook từ bằng chứng mới rồi thử trên lab, không chỉ thêm một câu “restart dịch vụ”.

## 9. Lỗi thường gặp và tự kiểm tra

| Nhầm lẫn | Cách sửa lập luận |
|---|---|
| Thay đổi mới nhất chắc là nguyên nhân | Đối chiếu timeline, phạm vi và phép thử bác bỏ |
| Restart hết lỗi nên đã hiểu nguyên nhân | Restart là hành động; còn phải giải thích trạng thái nào được reset |
| Hai replica là HA đầy đủ | Vẽ miền host/storage/network/quyền dùng chung |
| CPU host còn nên cgroup không nghẽn | Xem quota/throttling đúng nhóm, chênh lệch qua thời gian |
| df lệch du nên chắc deleted-open | Xem phạm vi, FD/nlink, mount, snapshot và accounting |
| Xóa file là chắc giải phóng ngay | Xét tên/hard link, tham chiếu mở và lớp lưu dữ liệu |
| Thêm app replica luôn tăng năng lực | Đo dependency/database/pool và tiêu chí SLI |
| Postmortem kết thúc ở “con người lỗi” | Tìm điều kiện lọt kiểm tra/phát hiện/phục hồi và hành động kiểm chứng |

1. File không còn tên nhưng FD còn mở: `du` cây tên có bắt buộc thấy 32 MiB không? **Đối chiếu:** không; xem FD/inode để chứng minh đối tượng còn.
2. Đóng FD lab và `df -h` không đổi rõ: có phủ nhận unlink semantics không? **Đối chiếu:** không; làm tròn, hoạt động khác/snapshot và accounting ảnh hưởng.
3. Database có hai replica cùng storage: lỗi storage còn là miền hỏng chung? **Đối chiếu:** có.
4. 9 instance, mỗi 700 request/giây kế hoạch, tải 6.000 và mất 1: đủ không? **Đối chiếu:** còn 8 × 700 = 5.600, chưa đủ theo mô hình.
5. Backend root nhanh còn route API chậm: curl `/` đủ bác bỏ backend không? **Đối chiếu:** không, cần route/cách gọi tương ứng.
6. Một biện pháp phục hồi SLI nhưng chưa biết nguyên nhân: có được ghi hoàn tất điều tra không? **Đối chiếu:** phục vụ có thể đã khôi phục, điều tra còn phần chưa biết phải ghi rõ.

Nộp mô hình miền hỏng, phép tính năng lực có giả định, evidence bundle lab, timeline, postmortem và runbook đã cập nhật. Bảo vệ một quyết định thêm tài nguyên và một quyết định sửa phần mềm bằng số liệu/thiết kế phép thử. Phân biệt kết quả thực sự chạy với ví dụ minh họa và nhánh chưa làm.

**Tự nhắc lại:** đi từ tác động người dùng đến đường phụ thuộc; giữ nhiều giả thuyết; giảm ảnh hưởng có phạm vi; xác minh bằng hành vi thật; dùng nguyên nhân và yếu tố góp phần để tạo cải tiến kiểm chứng được. Bài 40 tích hợp các bước ấy thành một hệ thống học tập hoàn chỉnh.

## Nguồn đối chiếu

- [Google SRE managing incidents](https://sre.google/sre-book/managing-incidents/), [postmortem](https://sre.google/sre-book/postmortem-culture/), [overload](https://sre.google/sre-book/handling-overload/).
- [unlink](https://man7.org/linux/man-pages/man2/unlink.2.html), [proc PID FD](https://man7.org/linux/man-pages/man5/proc_pid_fd.5.html), [lsof](https://man7.org/linux/man-pages/man8/lsof.8.html).
- [Cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html), [GNU df](https://www.gnu.org/software/coreutils/manual/html_node/df-invocation.html), [GNU du](https://www.gnu.org/software/coreutils/manual/html_node/du-invocation.html).
