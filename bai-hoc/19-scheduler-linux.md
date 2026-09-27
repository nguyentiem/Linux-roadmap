# Bài 19 — Scheduler thực tế trong Linux

[Mục lục](../README.md) · [← Bài 18](18-ly-thuyet-lap-lich.md) · [Bài 20 →](20-real-time-linux.md)

## Mục tiêu: từ lịch trên giấy đến luồng đang chạy trên máy

Ở bài 18, ta biết trước thời gian tính toán và tự chọn một CPU. Trên máy Linux, chương trình liên tục thức dậy, chờ dữ liệu, tạo luồng và tranh tài nguyên với chương trình khác. Nhân không biết chính xác phần việc tương lai. Vì vậy không thể đọc “Round Robin” rồi kết luận mọi chương trình Linux được cấp một lát giống nhau.

Sau bài này, bạn cần phân biệt policy với scheduling class; giải thích nice, trọng số, CFS và EEVDF; dùng công cụ để xem luồng, CPU được phép chạy và CPU gần nhất; làm thí nghiệm cạnh tranh có giới hạn; biết số liệu nào chưa đủ để kết luận. Cần bài 12 và 18. Các lab dành cho Linux có Bash, Python 3 và công cụ `ps`, `taskset`, `nice`, `timeout`; không cần quyền quản trị.

Tình huống xuyên suốt: hai chương trình tính toán P1 và P2 cùng muốn sử dụng CPU. Ta giảm ưu tiên của P2 để xem P1 có nhận được nhiều thời gian tính toán hơn hay không. Mọi tỷ lệ minh họa là mô hình, không bảo đảm máy bạn đo đúng tỷ lệ đó.

## 1. Ai có thể được chọn, và chọn trên CPU nào?

**Kernel — nhân hệ điều hành** là phần lõi quản lý phần cứng và tài nguyên. **Process — tiến trình** là một lần chương trình hoạt động; nó có **PID**, số nhận diện để các công cụ tìm đúng đối tượng. **Thread — luồng thực thi** là một dòng lệnh có trạng thái chạy riêng trong tiến trình; nhiều luồng có thể chia sẻ dữ liệu của cùng tiến trình. **TID**, số nhận diện luồng, giúp chọn đúng luồng khi tiến trình có nhiều luồng. **Task — đối tượng nhân cần lập lịch** trong đoạn này thường tương ứng một luồng. Linux lập lịch từng luồng, vì vậy thay đổi chỉ một PID không mặc nhiên thay tất cả luồng.

**Scheduler — bộ lập lịch** thuộc nhân, chọn luồng tiếp theo có thể chạy. **Runnable — sẵn sàng chạy** nghĩa là không thiếu điều kiện nào ngoài CPU; **running — đang chạy** là thực sự nhận CPU. Một luồng **blocked — đang chờ điều kiện**, chẳng hạn chờ dữ liệu từ ổ đĩa hoặc chờ khóa bảo vệ dữ liệu, không tham gia tranh CPU như một luồng runnable. **I/O — nhập/xuất** là trao đổi với thiết bị, như đọc tệp; chờ I/O có thể khiến luồng nhường CPU.

```text
Luồng vừa có dữ liệu / vừa được tạo
                 |
                 v
Tập CPU được phép → Hàng công việc sẵn sàng của CPU phù hợp
                                      |
                        Quy tắc và cơ chế lập lịch
                                      |
                                      v
                             Luồng được chạy
                            /                \
              còn việc, hết lượt           phải chờ dữ liệu
                     |                            |
              trở về hàng sẵn sàng           chờ rồi thức dậy
```

Mũi tên đầu cho biết có việc chưa đủ: task còn phải được phép chạy trên CPU ấy. **Run queue — hàng công việc sẵn sàng** là cấu trúc nhân dùng để quản lý lựa chọn; không nhất thiết là một hàng **FIFO — vào trước ra trước**, tức phục vụ theo thứ tự đến. Sơ đồ là mô hình khái niệm, không phải tên hàm hoặc mọi bước triển khai của một phiên bản kernel.

**SMP — hệ có nhiều bộ xử lý cùng phục vụ hệ điều hành** cho phép nhiều luồng chạy đồng thời trên các CPU khác nhau. Hệ nhiều nhân hoặc nhiều luồng phần cứng thường được Linux nhìn như nhiều **logical CPU — CPU logic**: đơn vị kernel có thể lập lịch lên. Hai CPU logic có thể dùng chung tài nguyên của một nhân vật lý; vì vậy “2 CPU” không luôn đồng nghĩa gấp đôi năng lực tính toán.

**Load balancing — cân bằng tải** chuyển hoặc phân phối việc để tránh CPU này quá đông còn CPU khác rảnh. **Migration — chuyển luồng sang CPU khác** có thể giúp dùng tài nguyên rảnh, nhưng ảnh hưởng **cache — bộ nhớ đệm của CPU**, nơi giữ dữ liệu truy cập nhanh. **Cache locality — tính gần dữ liệu trong bộ đệm** có lợi khi luồng chạy trên CPU còn dữ liệu nó cần. Pin cứng mọi luồng vào một CPU có thể tránh chuyển nhưng tạo nút nghẽn; không có lựa chọn tốt cho mọi tải. [Tài liệu thiết kế fair scheduler](https://docs.kernel.org/scheduler/sched-design-CFS.html).

## 2. Policy và scheduling class khác nhau ở đâu?

**Policy — chính sách lập lịch** là lựa chọn hành vi mà chương trình hoặc quản trị viên yêu cầu thông qua giao diện hệ điều hành. **Scheduling class — lớp triển khai lập lịch** là nhóm cơ chế bên trong nhân xử lý các loại task. Một class có thể phục vụ nhiều policy; tên API không chứng minh thuật toán bên trong giữ nguyên mãi.

Bảng sau giúp hiểu loại yêu cầu trước khi đo. Các policy thường dùng có tên hằng số bắt đầu bằng `SCHED_`:

| Policy | Nhu cầu chính | Điều cần tránh suy luận |
|---|---|---|
| `SCHED_OTHER`, còn gọi `SCHED_NORMAL` trong ngữ cảnh kernel | Chia CPU cho công việc bình thường | Không cam kết hạn hoàn thành |
| `SCHED_BATCH` | Công việc tính toán theo lô, ít cần ưu tiên thức dậy để tương tác | Không phải “chỉ chạy ban đêm” hay đợi CPU hoàn toàn rảnh |
| `SCHED_IDLE` | Việc ở mức ưu tiên rất thấp | Khác luồng idle nội bộ chạy khi CPU không còn việc |
| `SCHED_FIFO`, `SCHED_RR` | Công việc dùng ưu tiên thời gian thực | Thang ưu tiên riêng, khác nice |
| `SCHED_DEADLINE` | Khai báo ngân sách và hạn CPU | Không tự bảo đảm cả đường đi dữ liệu đáp ứng đúng hạn |

**Real-time — thời gian thực** nghĩa là tính đúng đắn còn phụ thuộc hoàn thành trong hạn thời gian, không chỉ kết quả tính toán đúng. Ví dụ, lệnh điều khiển đến sau thời điểm cần có thể không còn hữu ích. Bài 20 giải thích ba policy thời gian thực; bài này chỉ thay nice của chương trình bình thường. Mô tả API đối chiếu [sched(7)](https://man7.org/linux/man-pages/man7/sched.7.html).

Cấu hình nhân có thể bổ sung cơ chế. Ví dụ **sched_ext** là cơ chế mở rộng cho phép triển khai scheduler bằng chương trình chạy trong môi trường BPF của kernel; **BPF** ở đây là cơ chế kernel kiểm tra và chạy chương trình mở rộng, không cần học để làm lab. Nếu hệ bật và đang sử dụng sched_ext, không kết luận mọi task `SCHED_OTHER` chắc được chọn trực tiếp bằng EEVDF. Đây là một lý do kiểm tra môi trường trước khi suy ra triển khai. [Tài liệu sched_ext](https://docs.kernel.org/scheduler/sched-ext.html).

## 3. Nice thay đổi gì, và vì sao không phải một tỷ lệ cố định?

**Nice — mức nhường CPU** là một số ảnh hưởng cách chia CPU trong nhóm lập lịch công bằng. Khoảng thường dùng trên Linux là −20 đến 19. Số lớn hơn nghĩa là nhường hơn; `nice 10` thường nhận ít phần hơn `nice 0` **khi cùng cạnh tranh**. Nó không đặt tốc độ CPU, không giảm dung lượng bộ nhớ và không ra lệnh task phải ngủ đúng phần trăm thời gian.

Nhân chuyển nice thành **weight — trọng số**, một mức đóng góp tương đối khi chia tài nguyên. Hình dung hai task luôn sẵn sàng trong cùng nhóm, cùng một CPU và không bị giới hạn khác: task có trọng số w1 và w2 có phần lý tưởng gần w1/(w1+w2), w2/(w1+w2). Tự đặt w1=4,w2=1 cho tỷ lệ lý tưởng 80% và 20%; đây **không** phải phép quy đổi `nice 0` và `nice 10`.

Nếu chỉ P2 sẵn sàng, P2 vẫn có thể dùng gần trọn CPU dù nice 10. Khi P1 thức dậy, P2 mới phải chia lại phần. Vì thế nice có ý nghĩa tương đối với đối thủ đang runnable, không phải một giới hạn cứng.

Có thêm hai tầng dễ làm phép đo khác ví dụ:

- **Cgroup — nhóm kiểm soát tài nguyên**: nhân gom tiến trình thành nhóm để chia hoặc giới hạn tài nguyên. **CPU quota — hạn mức thời gian CPU** có thể chặn cả nhóm sau khi nhóm dùng hết ngân sách; đổi nice trong nhóm không tự xóa hạn mức. Trong cgroup v2, `cpu.max` mô tả hạn mức và `cpu.weight` mô tả trọng số giữa nhóm. [Tài liệu cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html).
- **Autogroup — nhóm tự động**: nếu được bật, Linux có thể nhóm tác vụ theo phiên làm việc để tăng tính tương tác. Hai task thuộc hai nhóm khác nhau có thể không cạnh tranh trực tiếp theo nice như hai task trong cùng nhóm. Chạy hai task từ cùng một shell giảm một biến gây nhiễu này, nhưng không xóa mọi tầng giới hạn. [Quy tắc group scheduling trong sched(7)](https://man7.org/linux/man-pages/man7/sched.7.html).

**Shell — trình nhận lệnh** như Bash là chương trình chạy lệnh bạn nhập. **Permission — quyền được phép thao tác** giới hạn người dùng có thể tác động tiến trình nào; thông thường bạn đổi tiến trình của chính mình. Tăng số nice để nhường CPU thường làm được với người dùng thường. Hạ số nice để tăng ưu tiên thường cần quyền phù hợp hoặc **resource limit — giới hạn tài nguyên của phiên/tiến trình** cho phép; `ulimit -e` trong Bash xem giới hạn nice liên quan. Lab không dùng `sudo` và không hạ nice của tiến trình đang chạy.

## 4. CFS và EEVDF chia phần bằng cách nào?

### 4.1. CFS: dùng bao nhiêu CPU so với phần đáng nhận?

**CFS — Completely Fair Scheduler**, cơ chế lập lịch công bằng hoàn toàn, là thiết kế lịch sử quan trọng để hiểu nhóm fair của Linux. Nó dùng **virtual runtime — thời gian chạy quy đổi**, thường viết `vruntime`, để so lượng CPU đã sử dụng theo trọng số. Thời gian chạy thật tăng bao nhiêu là do CPU phục vụ; vruntime tăng còn phụ thuộc mức được hưởng. [Mô tả CFS của kernel](https://docs.kernel.org/scheduler/sched-design-CFS.html).

Mô hình tự đặt: task X có trọng số 2, Y có trọng số 1. **Ms — mili giây** bằng 1/1.000 giây. Nếu mỗi task nhận 1 ms CPU, chọn một thang quy đổi đơn giản thì X tăng 0,5 còn Y tăng 1. X được hưởng nhiều phần hơn nên cùng một lượng CPU thật tạo “khoản đã phục vụ” nhỏ hơn. Chọn người được phục vụ ít hơn theo thang ấy giúp X dần nhận nhiều CPU thật hơn Y.

Không hiểu vruntime là đồng hồ thực: nó không cho biết ứng dụng xong sau bao nhiêu ms, cũng không nên đem giá trị của hai CPU/nhóm bất kỳ trừ nhau để tính thời gian đợi. Ví dụ chỉ mô tả ý tưởng trọng số, không là phép tái tạo toàn bộ CFS.

### 4.2. EEVDF: ai đang được nợ CPU, và nên phục vụ ai trước?

**EEVDF — Earliest Eligible Virtual Deadline First** là cơ chế chọn hạn ảo sớm nhất trong các task đủ điều kiện. Tài liệu kernel mô tả Linux bắt đầu chuyển fair scheduler sang EEVDF từ 6.6; hành vi cụ thể còn phụ thuộc phiên bản và các bản vá của hệ phân phối. **Distro — bản phân phối Linux** là bộ kernel, công cụ và cấu hình mà nhà cung cấp đóng gói; **backport — đưa bản vá mới về nhánh cũ** làm số phiên bản không kể hết tính năng thực tế. [Tài liệu EEVDF hiện hành](https://docs.kernel.org/scheduler/sched-eevdf.html).

**Lag — độ lệch so với phần công bằng** so việc task đã nhận với phần đáng nhận. Lag dương có thể hiểu là đang được nợ CPU. **Eligible — đủ điều kiện được chọn** trong mô tả này là không vượt quá phần công bằng theo tiêu chí lag. **Virtual deadline — hạn ảo** dùng trong lựa chọn giữa task đủ điều kiện; nó là mốc trong mô hình thời gian quy đổi, không phải hạn giờ thực mà ứng dụng đăng ký.

Ví dụ khái niệm: A và B đều được nợ CPU, nhưng A có lát phục vụ được yêu cầu ngắn hơn nên có thể có hạn ảo sớm hơn và được chọn trước. Nếu C đã dùng quá phần của mình, chỉ có hạn ảo nhỏ không đủ để được ưu tiên ngay: còn phải xét điều kiện. Hành vi thức dậy, việc giữ/tính lại lag và yêu cầu lát chạy đã có thay đổi theo phiên bản; không dùng mô hình ba câu này để dự đoán từng lần đổi luồng.

Cả CFS và EEVDF muốn chia phần công bằng có trọng số. EEVDF đồng thời giúp xử lý nhu cầu phản hồi của task có lát ngắn. **Hạn ảo EEVDF không phải deadline thời gian thực**, và `SCHED_OTHER` không biến thành `SCHED_DEADLINE` chỉ vì tài liệu dùng từ deadline.

## 5. Affinity có làm CPU thuộc riêng chương trình không?

**CPU affinity — tập CPU được phép chạy** là ràng buộc luồng chỉ có thể được lập lịch trên các CPU chỉ định. **Pin — ghim CPU** là cách nói khi thu tập này, thường xuống một CPU. **Mask — mặt nạ chọn CPU** biểu diễn tập bằng các bit; công cụ cũng có thể in danh sách số CPU cho dễ đọc.

Ví dụ P1 và P2 đều được phép chạy trên CPU 3: chúng phải chia CPU 3 với nhau và những công việc khác vẫn được phép vào đó. Ghim chỉ giới hạn P1/P2, không cấm người khác. Nếu ghim P1 vào 3 và P2 vào 4 trong khi cả hai CPU rảnh, mỗi task có thể dùng gần một CPU dù nice khác nhau: không có đối thủ trên cùng tài nguyên để thấy tỷ lệ chia.

**Cpuset — tập CPU của nhóm tài nguyên** hoặc cấu hình trong máy ảo có thể giới hạn CPU được phép; CPU 0 không phải luôn hợp lệ. Lệnh sau chỉ đọc tập hiện tại:

```bash
taskset -pc $$
python3 -c 'import os; print(sorted(os.sched_getaffinity(0)))'
```

Trong Bash, `$$` là PID shell hiện tại. `-p` yêu cầu đọc tiến trình đã có, `-c` in danh sách CPU. Python hỏi tập của chính nó; nó thường thừa hưởng tập từ shell. Đầu ra minh họa `current affinity list: 2-5` nghĩa là CPU 2,3,4,5 được phép, không nghĩa shell đang chạy trên cả bốn cùng lúc. Chỉ định một CPU không có trong tập có thể báo `Invalid argument`; hãy lấy từ tập thực tế. [Manual taskset](https://man7.org/linux/man-pages/man1/taskset.1.html).

## 6. Lab: nhận diện đúng luồng trước khi gây cạnh tranh

Các lệnh sau là đọc thông tin. `uname -r` cho phiên bản **nhân đang chạy**, không phải mọi nhân đã cài. `command -v` tìm chương trình có thể gọi, không kiểm tra một dịch vụ đang hoạt động. `chrt` ở dạng `-p PID` đọc policy/ưu tiên, không đổi chúng.

```bash
uname -r
command -v python3 ps taskset nice timeout chrt
ps -L -p $$ -o pid,tid,cls,rtprio,ni,psr,stat,comm
taskset -pc $$
chrt -p $$
```

Cách đọc các cột do `ps` của procps-ng cung cấp:

| Cột | Cần nhìn gì? | Không chứng minh điều gì? |
|---|---|---|
| PID, TID | Tiến trình và luồng đang xem | Một PID không đại diện mọi luồng khi cần sửa thuộc tính |
| CLS | `TS` thường là `SCHED_OTHER`; `FF`,`RR`,`DLN` là các policy khác | Không xác nhận fair class đang dùng CFS hay EEVDF |
| RTPRIO | Ưu tiên của policy thời gian thực; dấu `-` khi không áp dụng | Không thay cho nice |
| NI | Nice, như 0 hoặc 10 | Không là phần trăm CPU |
| PSR | CPU luồng gần nhất đã chạy | Không là tập CPU được phép |
| STAT | Trạng thái: `R` chạy/sẵn sàng, `S` chờ có thể đánh thức | Ảnh chụp không kể toàn bộ lịch trước đó |
| COMM | Tên chương trình | Không luôn là đầy đủ dòng lệnh |

Tên trường và ký hiệu khác trên bản BusyBox tối giản; dùng `ps --help` hoặc `man ps` đúng máy, không coi lỗi tùy chọn là kernel không có scheduler. [Manual ps](https://man7.org/linux/man-pages/man1/ps.1.html).

Nếu thư mục `/sys/kernel/sched_ext` tồn tại, hệ có thể có các mục mô tả trạng thái sched_ext; đọc theo [tài liệu kernel](https://docs.kernel.org/scheduler/sched-ext.html), không suy rằng có thư mục tức có scheduler mở rộng đang hoạt động. Để kết luận triển khai cụ thể cần đối chiếu phiên bản, cấu hình và nguồn/bản vá distro.

## 7. Lab: đo cùng nice rồi đo khác nice trên cùng một CPU

### 7.1. Cách chạy có giới hạn và lấy đúng PID con

Thực hiện trong VM hoặc máy thử nghiệm, cùng một Bash thông thường không bật `set -e`/`set -o pipefail`, các công cụ đã tìm được ở mục 6. Hai chế độ này làm shell tự dừng ở một số lệnh/pipeline trả mã khác 0; vòng tìm con có thể gặp trường hợp ấy khi tiến trình chưa xuất hiện. Kiểm tra `ps -p $$ -o ni=`: lab kỳ vọng shell nice 0. `nice -n N` cộng N vào nice được thừa hưởng, không đặt tuyệt đối bằng N; nếu shell nice khác 0, hãy dùng phiên có nice 0 để so đúng hai trường hợp dưới đây. **VM — máy ảo** là máy được phần mềm mô phỏng/chia tài nguyên từ máy chủ; lịch của máy chủ có thể làm số đo thêm nhiễu. **Wrapper — chương trình bao ngoài** ở đây là `timeout`: nó khởi chạy Python và giám sát thời hạn. `timeout 15s` gửi tín hiệu kết thúc khi đủ thời gian; `--kill-after=2s` bổ sung giới hạn khi con không dừng sau tín hiệu đầu.

Lệnh sau định nghĩa hàm `run_case` trong phiên Bash hiện tại; không ghi file hay đổi cấu hình hệ thống. Mỗi lần chạy tạo hai vòng tính toán hữu hạn về thời gian. Chạy cả hai trong cùng shell và trên cùng CPU để tăng khả năng quan sát tranh chấp trực tiếp.

```bash
lab_cpu=$(python3 -c 'import os; print(min(os.sched_getaffinity(0)))')
run_case() {
    local nice_delta=$1 wrap1 wrap2 child1 child2 status1 status2
    taskset -c "$lab_cpu" timeout --kill-after=2s 15s \
        python3 -c 'while True: pass' &
    wrap1=$!
    taskset -c "$lab_cpu" nice -n "$nice_delta" \
        timeout --kill-after=2s 15s python3 -c 'while True: pass' &
    wrap2=$!
    # $! là PID của timeout sau khi các công cụ trước nó thay chương trình.
    # Chờ tối đa 2 giây để tìm Python con trực tiếp của mỗi wrapper.
    child1= child2=
    for _ in {1..20}; do
        child1=$(ps --ppid "$wrap1" -o pid=,comm= |
            awk '$2 == "python3" {print $1; exit}')
        child2=$(ps --ppid "$wrap2" -o pid=,comm= |
            awk '$2 == "python3" {print $1; exit}')
        [[ -n "$child1" && -n "$child2" ]] && break
        sleep 0.1
    done
    if [[ -n "$child1" && -n "$child2" ]]; then
        printf 'CPU=%s P1=%s P2=%s nice_delta(P2)=%s\n' \
            "$lab_cpu" "$child1" "$child2" "$nice_delta"
        taskset -pc "$child1"
        taskset -pc "$child2"
        sleep 5
        ps -p "$child1,$child2" -o pid,ppid,ni,cls,psr,pcpu,time,comm
        sleep 5
        ps -p "$child1,$child2" -o pid,ppid,ni,cls,psr,pcpu,time,comm
    else
        printf 'Không tìm được Python con; kiểm tra lỗi khởi chạy phía trên.\n'
    fi
    # Dùng nhánh if để vẫn đọc được status khi shell bật set -e.
    if wait "$wrap1"; then status1=0; else status1=$?; fi
    if wait "$wrap2"; then status2=0; else status2=$?; fi
    printf 'timeout status: P1=%s P2=%s\n' "$status1" "$status2"
}
run_case 0
run_case 10
```

`$!` lưu PID lệnh nền vừa khởi chạy. Sau chuỗi `taskset`/`nice` chuyển sang chạy lệnh tiếp theo, PID ấy thuộc wrapper `timeout`; Python có PID con khác. `ps --ppid` tìm con trực tiếp; `awk` là công cụ chọn dòng/cột văn bản, ở đây lấy cột PID khi tên là `python3`. `sleep` tạm dừng shell để chương trình có thời gian chạy. `wait` đợi wrapper kết thúc và lấy **exit status — mã kết thúc**: 0 thường là thành công, 124 thường là `timeout` đã dừng theo thời hạn. Với đường kết thúc buộc dùng tín hiệu kill, có thể thấy 137; đọc [manual timeout](https://www.gnu.org/software/coreutils/manual/html_node/timeout-invocation.html). Một status khác cần đối chiếu lỗi thật, không bỏ qua.

Nếu muốn dừng sớm trong lúc chạy, ở terminal khác gửi `kill -TERM PID_WRAPPER` cho từng PID wrapper đang có; **signal — tín hiệu** là thông báo hệ điều hành gửi để yêu cầu hành động như kết thúc. Wrapper mặc định chuyển tiếp tín hiệu đến lệnh được giám sát. Không dùng `killall python3`, vì có thể dừng cả chương trình Python ngoài lab. Dù quên dừng, thời hạn của lab vẫn giới hạn tải.

### 7.2. Đọc số liệu và giới hạn kết luận

`PCPU`/`%CPU` của `ps` là tỷ lệ trung bình CPU theo vòng đời tiến trình, không phải ảnh đo tức thời. `TIME` là tổng thời gian CPU đã dùng; khác thời gian từ lúc khởi chạy. Hai lần chụp gần giữa/cuối giúp tránh kết luận từ thời điểm mới khởi chạy. Đầu ra **minh họa**, không phải yêu cầu tỷ lệ máy bạn:

```text
PID   PPID  NI CLS PSR %CPU     TIME COMMAND
8101  8100   0  TS   3 49.0 00:00:05 python3
8103  8102   0  TS   3 48.5 00:00:05 python3
```

Hai `PSR=3` phù hợp việc ghim CPU 3, nhưng chỉ `taskset -pc` xác nhận tập được phép. Ở lần cùng nice, hai task thường có phần gần nhau nếu không có giới hạn/tải khác; cộng không nhất thiết đúng 100% vì kernel và các việc khác cũng dùng CPU. Ở lần P2 nice 10, kiểm tra **NI thật sự là 10** rồi xem P1 có `%CPU`/`TIME` cao hơn P2 rõ rệt không.

Không chốt tỷ lệ chính xác: quota nhóm, autogroup, scheduler mở rộng, luồng khác và VM có thể thay kết quả. Một mẫu lệch không chứng minh quy tắc nice sai. Nếu chưa thấy chênh lệch, kiểm tra đúng PID con, cùng affinity, cùng policy, thời gian mẫu và các nhóm tài nguyên trước.

Muốn quan sát từng khoảng thay vì trung bình vòng đời, dùng `top -p PID1,PID2` hoặc `pidstat -p PID1,PID2 1` nếu công cụ từ gói **sysstat — bộ công cụ thống kê hệ thống** đã được cài. Không có `pidstat` chỉ nghĩa thiếu công cụ đó, không nghĩa máy không lập lịch. Ghi cách chuẩn hóa `%CPU` của công cụ khi so sánh máy nhiều CPU.

## 8. Context switch nhiều có phải scheduler hoạt động kém?

**Context switch — chuyển ngữ cảnh** là đổi luồng đang được CPU phục vụ bằng cách lưu/khôi phục trạng thái. **Voluntary — tự nguyện** thường xảy ra khi luồng cần chờ hoặc chủ động nhường; **nonvoluntary — không tự nguyện** thường xảy ra khi luồng bị thu hồi CPU để phục vụ luồng khác. Một số chuyển đổi vẫn là hoạt động bình thường, không là lỗi.

**Procfs — cây thông tin tiến trình do kernel cung cấp** xuất hiện dưới `/proc`; đọc các tệp ở đây thường cho thông tin đang chạy, không phải văn bản lưu sẵn trên ổ đĩa. Trong lúc Python còn sống, thay `PID_PYTHON` bằng PID con của lab:

```bash
rg '^(voluntary_ctxt_switches|nonvoluntary_ctxt_switches|Cpus_allowed_list):' \
    /proc/PID_PYTHON/status
```

Nếu chưa có `rg`, dùng `grep -E` với cùng biểu thức. Hai bộ đếm là số tích lũy; muốn so tốc độ hãy lấy chênh lệch hai lần đọc trong khoảng thời gian xác định. Với tiến trình nhiều luồng, xem `/proc/PID/task/TID/status` cho từng luồng; file cấp tiến trình không là tổng mọi luồng. [Proc status manual](https://man7.org/linux/man-pages/man5/proc_pid_status.5.html).

Ví dụ minh họa: bộ đếm không tự nguyện tăng từ 200 lên 260 trong 2 giây nghĩa là thêm 60 lần, trung bình 30 lần/giây trong khoảng đo. Không có con số phổ quát để tuyên bố 30 là xấu; cần hỏi nó ảnh hưởng phản hồi hay thông lượng như thế nào. Task đọc dữ liệu thường xuyên có nhiều lần tự nguyện chờ vẫn có thể hoạt động đúng.

Nice không làm ổ đĩa nhanh hơn, không rút ngắn thời gian giữ khóa của task khác và không loại bỏ quota nhóm. Trước khi chữa “chậm” bằng nice, xác định task đang runnable hay đang chờ thứ gì.

## 9. Những lỗi thường gặp và cách kiểm tra lại

| Hiện tượng / suy luận sai | Cách kiểm tra |
|---|---|
| CPU 0 không hợp lệ | Lấy CPU từ `os.sched_getaffinity(0)`, không lấy từ số CPU tổng |
| `%CPU` của PID `$!` gần 0 | Đó có thể là wrapper chờ con; tìm Python bằng PPID |
| Nice khác nhưng cả hai gần đủ một CPU | Xem affinity: có thể ở hai CPU rảnh khác nhau |
| “Ghim rồi sao còn bị tranh CPU?” | Affinity không dành riêng CPU; xem các công việc khác |
| `PSR` khác mốc trước | Nó là CPU gần nhất; xem `taskset` để biết tập và xem có migration không |
| Không hạ nice trở lại 0 được | Kiểm tra quyền/limit; kết thúc lab và tạo tiến trình mới từ shell nice 0 |
| Đọc kernel version rồi khẳng định chính xác thuật toán | Đối chiếu cấu hình, backport và sched_ext đang hoạt động |
| Nhiều switch nên chắc là lỗi | Đo theo khoảng, phân biệt tự nguyện và không tự nguyện, liên hệ tác động ứng dụng |

## 10. Tự kiểm tra và hồ sơ thí nghiệm cần giữ

1. Một task nice 19 chạy gần 100% một CPU có mâu thuẫn không? **Đối chiếu:** không, nếu không có đối thủ runnable phù hợp và không bị giới hạn.
2. P1 và P2 cùng nice nhưng thuộc hai cgroup có quota khác nhau. Có bắt buộc nhận CPU bằng nhau không? **Đối chiếu:** không; cách chia trong nhóm không xóa giới hạn giữa nhóm.
3. `ps` in `PSR=4`. Có biết task chỉ chạy được CPU 4 không? **Đối chiếu:** không; cần affinity của đúng luồng.
4. EEVDF có virtual deadline ảo sớm. Có cam kết cảm biến được xử lý trong 2 ms không? **Đối chiếu:** không; đó là tiêu chí fair scheduling, khác hạn thời gian thực toàn tuyến.
5. Muốn so hai kết quả nice, giữ biến nào? **Đối chiếu:** cùng CPU được phép, cùng policy, cùng chương trình/thời lượng, nhóm tài nguyên, tải nền; ghi môi trường VM/host và kernel.

Nộp hai bảng `%CPU`/`TIME`, PID con, NI và affinity thực tế; ghi trạng thái kết thúc của timeout. Kết luận phải nói “trong điều kiện đo này” và ít nhất một điều chưa chứng minh được, chẳng hạn không đo được worst-case phản hồi.

**Tự nhắc lại:** runnable mới tranh CPU; policy là yêu cầu hành vi, class là cơ chế bên trong; nice thay phần tương đối, affinity thay nơi được chạy. CFS/EEVDF xử lý công bằng có trọng số. Đọc đúng PID, đúng khoảng đo và đúng lớp giới hạn trước khi gán nguyên nhân. Bài 20 thêm hạn thời gian và ngân sách toàn tuyến.

## Nguồn đối chiếu

- [Kernel — CFS design](https://docs.kernel.org/scheduler/sched-design-CFS.html), [EEVDF](https://docs.kernel.org/scheduler/sched-eevdf.html), [sched_ext](https://docs.kernel.org/scheduler/sched-ext.html).
- [Kernel — cgroup v2 CPU controller](https://docs.kernel.org/admin-guide/cgroup-v2.html).
- [Linux man-pages — sched](https://man7.org/linux/man-pages/man7/sched.7.html), [taskset](https://man7.org/linux/man-pages/man1/taskset.1.html), [ps](https://man7.org/linux/man-pages/man1/ps.1.html), [proc status](https://man7.org/linux/man-pages/man5/proc_pid_status.5.html).
- [GNU coreutils — nice](https://www.gnu.org/software/coreutils/manual/html_node/nice-invocation.html), [timeout](https://www.gnu.org/software/coreutils/manual/html_node/timeout-invocation.html): cú pháp và mã kết thúc. Phiên bản công cụ tối giản có thể không có tất cả tùy chọn trong lab.
