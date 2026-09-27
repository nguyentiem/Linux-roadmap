# Bài 20 — Real-time scheduling và PREEMPT_RT

[Mục lục](../README.md) · [← Bài 19](19-scheduler-linux.md) · [Bài 21 →](21-storage-filesystem.md)

## Mục tiêu: kết quả đúng nhưng đến muộn có còn đúng không?

Một chương trình tạo báo cáo xong chậm thêm một giây có thể vẫn hữu ích. Nhưng chương trình đọc cảm biến và điều khiển cơ cấu mỗi 10 **ms — mili giây**, với 1 ms = 1/1.000 giây, cần kết quả trước một hạn cụ thể; tính đúng mà đưa ra quá muộn có thể không đáp ứng yêu cầu. Bài này nối thời gian CPU với toàn bộ đường đi từ sự kiện đến phản ứng.

Sau bài này, bạn cần lập ngân sách thời gian; phân biệt `SCHED_FIFO`, `SCHED_RR`, `SCHED_DEADLINE`; hiểu giới hạn của Rate Monotonic và EDF; giải thích đảo ưu tiên và PREEMPT_RT; đo độ trễ thức dậy và viết kết luận có phạm vi. Cần nền tảng bài 04, 18–19. Lab cơ bản chỉ dùng Python và tải có thời hạn, không đổi policy thời gian thực, không sửa kernel hay thiết lập hệ thống.

## 1. Thời gian thực khác “chạy thật nhanh” ở đâu?

**Real-time — thời gian thực** là yêu cầu kết quả phải xuất hiện trong hạn thời gian cần thiết. **Deadline — hạn hoàn thành** là mốc muộn nhất để kết quả được coi là đúng hạn. **Hard real-time — thời gian thực với hạn bắt buộc** không chấp nhận vi phạm hạn trong điều kiện đã cam kết; **soft real-time — thời gian thực với hạn mềm** cho phép một số lần trễ nhưng chất lượng bị giảm, như âm thanh giật. Cách phân loại phải dựa vào yêu cầu ứng dụng, không chỉ tên policy của hệ điều hành.

**Latency — độ trễ** là thời gian từ một mốc đầu đến mốc phản ứng được chỉ định; phải nói hai mốc. **Jitter — độ dao động thời gian** là sự không đều giữa các lần phản ứng, có thể tính theo độ lệch so với lịch dự kiến hoặc sự thay đổi của các khoảng liên tiếp. Một hệ trung bình rất nhanh nhưng thỉnh thoảng trễ lâu có thể không phù hợp hạn bắt buộc.

Ví dụ minh họa: hệ A đáp ứng hầu hết lần trong 0,2 ms nhưng có lần 20 ms; hệ B luôn trong khoảng 1–2 ms. Nếu hạn là 5 ms, B đáp ứng các mẫu đã nêu còn A đã có vi phạm. Không được từ vài mẫu suy ra B luôn đúng hạn cho mọi trạng thái chưa đo.

**Kernel — nhân hệ điều hành** quản lý CPU và thiết bị. **Process — tiến trình** là một chương trình đang hoạt động, có tài nguyên riêng. **Thread — luồng thực thi** là dòng lệnh có trạng thái chạy riêng trong tiến trình; **Task — đối tượng kernel lập lịch** trong bài này thường tương ứng một luồng; kernel lập lịch từng luồng. **CPU** là bộ xử lý thực hiện lệnh. **Scheduler — bộ lập lịch** chọn luồng có thể chạy; tăng ưu tiên chỉ tác động một phần của đường đáp ứng.

## 2. Deadline phải tính từ đâu đến đâu?

**End-to-end — toàn tuyến** nghĩa là từ đầu vào thực tế đến đầu ra thực tế mà yêu cầu đặt ra. Tình huống xuyên suốt: cảm biến tạo mẫu, chương trình đọc và tính, sau đó gửi lệnh đến cơ cấu.

Trước khi đọc sơ đồ, cần hai thành phần: **interrupt — ngắt** là cách phần cứng báo CPU có sự kiện cần xử lý; **driver — trình điều khiển thiết bị** là phần mềm giúp hệ điều hành giao tiếp với thiết bị cụ thể. **I/O — nhập/xuất** là trao đổi dữ liệu với thiết bị, không chỉ tính toán CPU. Driver có thể xử lý ngắt, đưa dữ liệu về và đánh thức luồng đang đợi.

```text
Cảm biến có mẫu
    |
    v
Thiết bị báo sự kiện → nhân/driver xử lý → luồng trở thành sẵn sàng
                                               |
                                               v
                                     đợi được cấp CPU
                                               |
                                               v
                                  tính toán → gửi dữ liệu
                                               |
                                               v
                                      cơ cấu nhận lệnh
```

Mỗi mũi tên có thể mang độ trễ riêng. **Runnable — sẵn sàng chạy** nghĩa là luồng đã có điều kiện để thực hiện lệnh nhưng có thể còn đợi CPU. **Blocked — bị chặn để chờ** nghĩa là luồng chưa thể tiếp tục, như chờ dữ liệu hoặc chờ người khác giải phóng tài nguyên. Scheduler không thể ưu tiên một luồng chạy tiếp khi dữ liệu cần chưa có.

Một bảng ngân sách tự đặt để thấy ranh giới, **không phải thông số đo của phần cứng**:

| Đoạn | Ngân sách giả định |
|---|---:|
| Thiết bị tạo/chuyển mẫu và báo sự kiện | 0,5 ms |
| Nhân/driver đưa dữ liệu về | 0,4 ms |
| Đợi CPU và tài nguyên dùng chung | 0,6 ms |
| Tính toán | 1,2 ms |
| Truyền lệnh và cơ cấu nhận | 0,8 ms |
| Tổng | 3,5 ms |

Nếu hạn toàn tuyến 4 ms, còn 0,5 ms dự phòng theo bảng. Đổi policy có thể giảm một phần chờ CPU nhưng không tự rút ngắn truyền thiết bị. Bảng chỉ có giá trị khi những cận thời gian được xác lập đáng tin cho cùng điều kiện và các đoạn được phân chia đủ, không đếm trùng. Nếu các đoạn có thể song song, cần phân tích đường phụ thuộc thay vì cộng mọi hoạt động bất kể thứ tự.

**WCET — Worst-Case Execution Time**, thời gian thực thi CPU lớn nhất trong điều kiện xác định, khác trung bình và khác mẫu lớn nhất đã tình cờ đo. Muốn cam kết hạn bắt buộc cần cận đáng tin, điều kiện vận hành và phân tích đường chờ; một histogram đẹp chưa chứng minh WCET. **Histogram — bảng/biểu đồ đếm mẫu theo khoảng** sẽ được dùng trong lab để nhìn đuôi độ trễ.

## 3. FIFO và RR dành CPU thế nào?

**Policy — chính sách lập lịch** là hành vi yêu cầu qua giao diện kernel. **Priority — ưu tiên** của luồng thời gian thực dùng thang riêng: trên Linux với FIFO/RR, 1 thấp và 99 cao. **Nice — mức nhường CPU** ở bài 19 thuộc cách chia của công việc bình thường, không thay thế ưu tiên FIFO/RR. Một luồng bình thường có nice −20 vẫn không tương đương luồng FIFO ưu tiên 1.

**Preemption — thu hồi quyền chạy** cho phép task ưu tiên cao hơn tạm dừng task thấp hơn đang chạy. **Yield — chủ động nhường lượt** là task yêu cầu để task khác có cơ hội; nó không bảo đảm mọi task thấp hơn được chạy.

- **`SCHED_FIFO`** chọn luồng sẵn sàng có ưu tiên thời gian thực cao nhất. Trong cùng mức, thứ tự theo các quy tắc hàng đợi FIFO. Task đang chạy không tự mất lượt chỉ vì đã dùng một lát định kỳ: nó thường tiếp tục đến khi phải chờ, tự nhường, kết thúc hoặc bị mức cao hơn thu hồi CPU.
- **`SCHED_RR`** bổ sung **quantum — lát thời gian** giữa các task **cùng mức ưu tiên**. Hết lượt thì task chưa xong chuyển về cuối hàng mức đó. RR không có nghĩa chia đều giữa mọi ưu tiên.

Các quy tắc chi tiết khi đổi ưu tiên hoặc thức dậy nằm trong [sched(7)](https://man7.org/linux/man-pages/man7/sched.7.html); tổng quan trên cần đặt trong giới hạn CPU và các cơ chế kiểm soát tài nguyên thực tế.

Ví dụ lý thuyết: A và B cùng FIFO ưu tiên 50, A đang chạy một vòng tính toán không chờ và không nhường; B không được bảo đảm có lượt chỉ vì đã đợi lâu. Với RR cùng mức, B có thể nhận lượt sau lát A. Nhưng nếu H ưu tiên 60 cứ runnable, A/B vẫn không được phục vụ như hai task đồng cấp. Task `SCHED_DEADLINE` còn thuộc cơ chế riêng, không so bằng số priority 50 này.

**RT throttling — hạn chế phần CPU dành cho tác vụ thời gian thực** có thể giữ cơ hội cho phần việc khác theo cấu hình hệ thống. **Permission — quyền thao tác** và giới hạn tài nguyên cũng kiểm soát ai được bật policy RT. Có sẵn công cụ `chrt` không có nghĩa người dùng có quyền đổi policy, và `chrt -p PID` chỉ đọc. Không tắt giới hạn hoặc tạo vòng lặp FIFO ưu tiên cao để thử bài: điều đó không cần cho mục tiêu cơ bản.

## 4. SCHED_DEADLINE: runtime, deadline và period là ba thứ khác nhau

**Periodic task — công việc định kỳ** sinh một lần việc theo mỗi chu kỳ; **job — một lần việc** là lần kích hoạt cụ thể. **Sporadic task — công việc xuất hiện rải rác với khoảng cách tối thiểu** không nhất thiết đến đều, nhưng các lần kích hoạt không gần nhau hơn chu kỳ tối thiểu đã định.

**Period T — chu kỳ/khoảng cách tối thiểu** cho biết tần suất việc đến. **Relative deadline D — hạn tương đối** tính từ mốc kích hoạt. **Absolute deadline — hạn tuyệt đối** là mốc trên trục thời gian: kích hoạt ở 100 ms, D=8 ms thì hạn tuyệt đối là 108 ms. **Runtime Q — ngân sách CPU** là lượng thời gian tính toán được khai báo trong cơ chế `SCHED_DEADLINE`; nó không phải tổng thời gian từ kích hoạt đến xong.

```text
100 ms: job kích hoạt                         108 ms: hạn tuyệt đối
   |                                                  |
   +---- đợi CPU ----[dùng CPU Q tối đa 2 ms]-----------+
   |<---------------- D = 8 ms ---------------------->|
   |<-------------------- T = 10 ms -------------------------->|
                                                         110 ms: lần kế tiếp
```

Đọc theo chiều thời gian: Q là phần CPU bên trong khoảng D, không phải một đoạn bắt buộc bắt đầu ngay khi kích hoạt. T nói lúc có thể đến job kế tiếp. Ví dụ Q=2,D=8,T=10 ms đáp ứng quan hệ bắt buộc Q≤D≤T, nhưng quan hệ ấy **chỉ là một điều kiện cấu hình**, không tự chứng minh tập công việc lập lịch được. Giao diện `sched_setattr` khai báo giá trị thời gian theo nanosecond, với 1 ms=1.000.000 ns và thêm các kiểm tra hợp lệ. [Manual sched_setattr](https://man7.org/linux/man-pages/man2/sched_setattr.2.html).

Cơ chế kết hợp **EDF — Earliest Deadline First**, chọn job có hạn gần nhất, với **CBS — Constant Bandwidth Server**, cơ chế quản lý ngân sách để một task dùng quá phần không tùy ý phá phần của task khác. Dùng hết runtime có thể bị tạm ngăn chạy đến mốc phục hồi ngân sách theo quy tắc. Hạn mà EDF trong kernel so sánh là **scheduling deadline — hạn nội bộ của bộ lập lịch**, được CBS duy trì cùng ngân sách còn lại; nó không phải lúc nào cũng là hạn nghiệp vụ bạn vừa tính từ một lần cảm biến có mẫu. Task ngủ rồi thức dậy có thể giữ hoặc được cập nhật hạn/ngân sách tùy trạng thái theo thuật toán. Vì vậy ứng dụng vẫn phải theo dõi mốc kích hoạt và hạn nghiệp vụ riêng, không đọc tên `SCHED_DEADLINE` rồi suy ra mỗi lần thức dậy đều được cấp một ngân sách mới ngay lập tức. **Admission control — kiểm tra tiếp nhận** kiểm tra yêu cầu tài nguyên khi đăng ký; yêu cầu có thể bị từ chối nếu không phù hợp, không phải mọi bộ Q,D,T hợp lệ đều được nhận. [Tài liệu SCHED_DEADLINE của kernel](https://docs.kernel.org/scheduler/sched-deadline.html).

Với ứng dụng cần 3 ms CPU mà khai Q=2 ms, ngân sách quá thấp có thể khiến bị ngăn chạy trước khi xong. Khai Q lớn hơn mọi nhu cầu cũng không miễn phí: dành phần lớn làm khó nhận các task khác. Dữ liệu Q phải dựa trên phân tích/đo phù hợp và có dự phòng, không lấy trung bình cho yêu cầu hạn bắt buộc.

**Giới hạn:** ngân sách CPU không tự bảo đảm thiết bị trả dữ liệu sớm, khóa được giải phóng sớm hoặc mạng truyền đúng hạn. Nếu nhiệm vụ là cảm biến→cơ cấu, vẫn cần ngân sách toàn tuyến mục 2. Lab ở bài này chỉ tính mô hình, không yêu cầu đăng ký `SCHED_DEADLINE` thật.

## 5. Tính mức sử dụng có đủ biết mọi deadline đều đạt?

### 5.1. Rate Monotonic: chu kỳ ngắn có ưu tiên cao

**Rate Monotonic — ưu tiên theo tần suất định kỳ**, viết RM, đặt task có period ngắn hơn ở ưu tiên cố định cao hơn. Chu kỳ 4 ms được ưu tiên trước chu kỳ 5 ms trong mô hình này. Khác EDF, mức RM không đổi chỉ vì hạn tuyệt đối của job hiện tại đang gần hơn.

Để dùng kiểm tra cổ điển, cần giả định một CPU; task định kỳ độc lập; deadline bằng period; có thu hồi CPU; biết cận tính toán C của mỗi job; không có chi phí phụ, chờ khóa hoặc chờ I/O ảnh hưởng mô hình. **Utilization U — mức yêu cầu CPU** bằng tổng Cᵢ/Tᵢ. Điều kiện **đủ** của RM là:

```text
U = C1/T1 + C2/T2 + ... + Cn/Tn
U ≤ n × (2^(1/n) − 1)
```

n là số task. Với n=2, ngưỡng ≈0,8284. “Đủ” nghĩa là thỏa trong giả định thì có kết luận lập lịch được; vượt ngưỡng **không** tự kết luận thất bại. Ví dụ hai task C/T=1/2 và 2/4 có U=1, vượt 0,8284, nhưng có lịch RM `0–1 task ngắn | 1–2 task dài | 2–3 task ngắn | 3–4 task dài` lặp mỗi 4 đơn vị: cả hai đạt hạn. [Bài gốc Liu–Layland 1973](https://www.cs.ru.nl/~hooman/DES/liu-layland.pdf).

### 5.2. EDF: hạn gần nhất được chọn, trong đúng mô hình

Với task định kỳ độc lập trên một CPU, có thu hồi, deadline bằng period và bỏ qua chi phí phụ/chờ tài nguyên, EDF có thể lập lịch tập task khi U≤1. Không bê tiêu chí ấy nguyên vẹn sang nhiều CPU hoặc deadline ngắn hơn period; cần phân tích phù hợp mô hình.

Ví dụ chính của bài gốc: C1=1,T1=D1=4 ms; C2=1,T2=D2=5 ms. U=1/4+1/5=0,45, nên đạt điều kiện đủ RM hai task và tiêu chí EDF trong mô hình. Điều đó không có nghĩa hệ thật “còn 55% nên an toàn”: nếu task cần khóa đang bị giữ 10 ms, hạn 4 ms vẫn có thể hỏng dù CPU có nhiều lúc rảnh.

### 5.3. Lab tính mô hình, không thay policy

Chạy Python sau để kiểm tra phép tính; nó chỉ in số:

```bash
python3 - <<'PY'
cases = {
    'mau_1_4_va_1_5': [(1, 4), (1, 5)],
    'vuot_nguong_du_nhung_co_lich_RM': [(1, 2), (2, 4)],
}
for label, tasks in cases.items():
    n = len(tasks)
    u = sum(c / t for c, t in tasks)
    bound = n * (2 ** (1 / n) - 1)
    print(label, 'U=', round(u, 4), 'RM_bound=', round(bound, 4),
          'qua_dieu_kien_du_RM=', u <= bound, 'EDF_model=', u <= 1)
PY
```

Kết quả cần đọc: case đầu U=0,45, RM_bound=0,8284 và hai kiểm tra đều `True`; case thứ hai U=1, kiểm tra đủ RM là `False` còn EDF là `True`. `False` ở cột RM chỉ nghĩa phép kiểm tra đủ không kết luận, không phủ nhận lịch vẽ ở trên. `True` ở EDF chỉ xét mô hình, không kiểm tra thiết bị, kernel hoặc độ trễ Python.

## 6. Vì sao task cao bị task trung bình giữ chân? Priority inversion

Trước hết, **lock — khóa bảo vệ tài nguyên dùng chung** ngăn nhiều luồng cùng sửa dữ liệu làm hỏng trạng thái. **Mutex — khóa loại trừ lẫn nhau** cho phép một luồng giữ và các luồng khác chờ đến khi chủ sở hữu trả khóa. Ví dụ L đang cập nhật cấu trúc dữ liệu cảm biến, H muốn đọc cấu trúc ấy nên phải đợi. **Critical section — đoạn mã được bảo vệ** là phần từ lấy khóa đến trả khóa.

**Priority inversion — đảo ưu tiên** xảy ra khi luồng cao H phải chờ luồng thấp L, trong khi luồng trung bình M tiếp tục lấy CPU của L, khiến H gián tiếp chờ M.

```text
1. L lấy mutex → L chưa trả khóa
2. H thức dậy → H cần mutex → H bị chặn
3. M runnable → M có ưu tiên hơn L → L không chạy để trả khóa
4. H vẫn đợi, dù H có ưu tiên cao hơn M
```

Đọc từng bước: scheduler ưu tiên H không giúp lúc H bị chặn; người cần được chạy lúc đó lại là L đang giữ tài nguyên H cần. Tăng ưu tiên H thêm nữa cũng không làm khóa tự biến mất.

**Priority inheritance — kế thừa ưu tiên** tạm nâng L theo ưu tiên của H đang chờ khóa phù hợp. Khi L có đủ ưu tiên để chạy trước M, L hoàn tất đoạn được bảo vệ, trả khóa, H có thể chạy; sau đó mức nâng được bỏ theo quy tắc của các khóa/liên hệ chờ còn lại. Đây không phải tăng ưu tiên L vĩnh viễn.

**Deadlock — kẹt do chờ vòng tròn** là tình trạng các luồng giữ tài nguyên và chờ nhau không thể tiến; kế thừa ưu tiên không tự phá vòng chờ. Nó cũng không làm đoạn giữ khóa 10 ms thành 1 ms. Với mutex ứng dụng POSIX, cần cấu hình giao thức thích hợp như `PTHREAD_PRIO_INHERIT` và kiểm tra hệ hỗ trợ; không mặc định mọi mutex đều kế thừa ưu tiên. [Giao thức mutex POSIX](https://man7.org/linux/man-pages/man3/pthread_mutexattr_setprotocol.3p.html).

Tự kiểm tra bằng mô hình giấy: đặt L giữ khóa cần thêm 2 ms CPU, H cần khóa, M tính 20 ms. Không kế thừa, M có thể đẩy lùi 2 ms của L; có kế thừa phù hợp, L có cơ hội chạy để trả khóa sớm. Bài tập không đòi chạy ba luồng RT thật.

## 7. PREEMPT_RT thay đổi gì và không tự bảo đảm gì?

**PREEMPT_RT** là cấu hình/cơ chế kernel tăng khả năng thu hồi CPU trong nhiều đường xử lý của nhân để giảm những khoảng ứng dụng ưu tiên cao không thể nhận CPU. Nó bổ sung nền tảng giảm độ trễ, không là một policy thay `SCHED_FIFO` hay `SCHED_OTHER`. Kernel có hỗ trợ PREEMPT_RT và kernel đang bật cấu hình ấy là hai chuyện khác nhau.

**Spinlock — khóa chờ bằng cách quay kiểm tra** dùng trong nhân thường để bảo vệ đoạn ngắn trong những ngữ cảnh nhất định. **`spinlock_t`** là loại khóa kernel; trên PREEMPT_RT, ngữ nghĩa của nhiều khóa loại này thay đổi theo cơ chế khóa dựa trên RT-mutex. **RT-mutex — khóa có cơ chế kế thừa ưu tiên của nhân** giúp xử lý tình huống chờ giữa các mức. **`raw_spinlock_t`** vẫn giữ vai trò khóa quay cấp thấp cần cho một số vùng rất nhạy cảm. Trên RT, chờ lấy `spinlock_t` có thể đưa luồng vào trạng thái ngủ để đợi khóa; điều này không có nghĩa mọi thao tác có thể ngủ đều hợp lệ trong mọi ngữ cảnh đang giữ khóa. Phải xét đúng loại khóa và ngữ cảnh theo [tài liệu lock types của kernel](https://docs.kernel.org/locking/locktypes.html). Không lấy quy tắc của cấu hình thường áp nguyên cho mọi đường mã RT. [Khác biệt khóa và ngữ cảnh trên PREEMPT_RT](https://docs.kernel.org/core-api/real-time/differences.html).

**Threaded interrupt — xử lý ngắt qua luồng** chuyển nhiều phần xử lý ngắt sang ngữ cảnh luồng có thể lập lịch; nhờ đó ưu tiên và thu hồi tác động được nhiều hơn. Tuy nhiên vẫn có phần xử lý thấp và loại ngắt/khóa không đi theo đường thông thường. Không khẳng định PREEMPT_RT biến mọi đoạn kernel thành thu hồi được. [Lý thuyết PREEMPT_RT của kernel](https://docs.kernel.org/core-api/real-time/theory.html).

Ví dụ: trước đây task cao thức dậy trong lúc CPU xử lý một vùng dài không thể bị lấy quyền chạy; task phải đợi vùng ấy kết thúc. Khi vùng được tổ chức thành phần có thể thu hồi, task có cơ hội chạy sớm hơn. Nhưng nếu cơ cấu cần chờ thiết bị vật lý 8 ms, PREEMPT_RT không tự loại bỏ 8 ms ấy.

Để nhận diện môi trường, **kernel config — cấu hình khi xây dựng nhân** xác định tính năng bật. Chỉ đọc:

```bash
uname -r
if [[ -r /sys/kernel/realtime ]]; then
    cat /sys/kernel/realtime
fi
if [[ -r /boot/config-$(uname -r) ]]; then
    grep -E '^CONFIG_PREEMPT_RT=|^# CONFIG_PREEMPT_RT is not set' \
        "/boot/config-$(uname -r)"
elif [[ -r /proc/config.gz ]]; then
    zgrep -E '^CONFIG_PREEMPT_RT=|^# CONFIG_PREEMPT_RT is not set' /proc/config.gz
fi
```

Trong Bash, `$(uname -r)` chèn tên kernel đang chạy vào đường dẫn. `CONFIG_PREEMPT_RT=y` là dấu cấu hình RT đã bật trong file được kiểm tra. Nếu có `/sys/kernel/realtime`, đọc ý nghĩa theo bản kernel/distro; `1` thường dùng để báo kernel RT. Không có file config hoặc không thấy dòng có thể do không công bố cấu hình/khác phiên bản, không đủ kết luận “không hỗ trợ”. Trong **container — môi trường tiến trình được cách ly** vẫn dùng kernel của **host — máy chủ chạy container**, `/boot` bên trong không nhất thiết có config đúng kernel host. Tên kernel có chữ `rt` là gợi ý, không thay việc kiểm tra cấu hình và trạng thái thật.

## 8. Lab cơ bản: đo thức dậy trễ bằng Python, không cần RT privilege

### 8.1. Chuẩn bị và hiểu đại lượng trước khi chạy

**Privilege — đặc quyền** cho phép thao tác vượt quyền người dùng thường; lab không cần đặc quyền ấy. **Shell — trình nhận lệnh**, như Bash, chạy các lệnh. Chuẩn bị Python 3 và một thư mục lab riêng để lưu `wake_jitter.py`. Chương trình chạy khoảng 5 giây với 500 mốc, mỗi mốc cách 10 ms, policy bình thường.

**Wall clock — đồng hồ ngày giờ** có thể được chỉnh bởi người dùng/đồng bộ. **Monotonic clock — đồng hồ tăng đơn điệu** không bị nhảy bởi việc chỉnh ngày giờ, phù hợp đo khoảng trong cùng lần chạy. **Absolute schedule — lịch theo mốc tuyệt đối** tính mốc thứ k từ thời điểm bắt đầu; khác ngủ 10 ms sau mỗi lần xử lý, cách sau cộng dồn thời gian làm việc thành **drift — lệch tích lũy**. [Python time](https://docs.python.org/3/library/time.html).

Lưu mã sau thành `wake_jitter.py`:

```python
import math
import time

period = 0.01
sample_count = 500
next_release = time.monotonic() + period
late_ms = []
for _ in range(sample_count):
    time.sleep(max(0.0, next_release - time.monotonic()))
    actual = time.monotonic()
    late_ms.append(max(0.0, actual - next_release) * 1000)
    next_release += period

ordered = sorted(late_ms)
def percentile(p):
    # Nearest-rank: mẫu ở vị trí ceil(p*N), với chỉ số Python trừ 1.
    return ordered[math.ceil(p * len(ordered)) - 1]

print('clock:', time.get_clock_info('monotonic'))
print('samples:', len(ordered), 'period_ms:', period * 1000)
print('lateness_ms p50=%.3f p99=%.3f max=%.3f' %
      (percentile(0.50), percentile(0.99), ordered[-1]))
bins = [0, 0, 0, 0]
for value in late_ms:
    if value < 0.1:
        bins[0] += 1
    elif value < 1:
        bins[1] += 1
    elif value < 10:
        bins[2] += 1
    else:
        bins[3] += 1
for label, count in zip(['[0,0.1)', '[0.1,1)', '[1,10)', '[10,+inf)'], bins):
    print('bin_ms', label, 'count', count)
print('late_over_one_period:', sum(x >= period * 1000 for x in late_ms))
```

**Lateness — trễ so với mốc** là `actual−next_release`, đổi giây sang ms. `time.sleep` yêu cầu nghỉ nhưng không hứa thức dậy chính xác; sau khi thời hạn nghỉ đến, task có thể còn đợi CPU. **p50/p99 — phân vị 50%/99%** ở đây lấy mẫu theo quy tắc nearest-rank đã ghi trong mã; với 500 mẫu, p99 là mẫu thứ 495 sau sắp tăng dần. `max` là mẫu lớn nhất **đã quan sát**, không phải cận lớn nhất có thể xảy ra.

Nếu trễ hơn một chu kỳ, vòng sau có thể không ngủ mà lấy các mẫu bắt kịp mốc. Chương trình không bỏ qua những mốc đã qua; việc này làm thay đổi phân bố lúc bị chậm dài. Nó không mô phỏng việc cảm biến bắt buộc xử lý mọi job với một lượng tính toán cố định. `late_over_one_period` đếm mốc trễ ít nhất 10 ms, không chứng minh deadline ứng dụng thật vi phạm nếu hạn của ứng dụng khác 10 ms.

### 8.2. Đo hai trạng thái với cùng affinity

**Affinity — tập CPU được phép chạy** giữ phép so sánh trên cùng CPU; nó không dành riêng CPU. **Wrapper — chương trình bao ngoài** `timeout` giới hạn tải cạnh tranh rồi dừng chương trình con. Chạy trên VM hoặc máy thử nghiệm có console/đường điều khiển dự phòng, trong thư mục chứa file vừa lưu, cùng Bash:

```bash
lab_cpu=$(python3 -c 'import os; print(min(os.sched_getaffinity(0)))')
# Trạng thái 1: chưa thêm tải của lab.
taskset -c "$lab_cpu" python3 wake_jitter.py
# Trạng thái 2: thêm một chương trình bận cùng CPU, tối đa 15 giây.
taskset -c "$lab_cpu" timeout --kill-after=2s 15s \
    python3 -c 'while True: pass' &
load_wrapper=$!
sleep 1
taskset -c "$lab_cpu" python3 wake_jitter.py
if wait "$load_wrapper"; then load_status=0; else load_status=$?; fi
printf 'load timeout status=%s\n' "$load_status"
```

`$!` là PID wrapper, không phải Python con; ở đây chỉ cần chờ wrapper nên không cần tìm con. Status 124 thường nghĩa hết hạn 15 giây, phù hợp lab; 137 có thể là đường buộc kill, cần đọc lại điều kiện. `taskset` hoặc Python lỗi khởi chạy cần xử lý trước khi so số liệu. Máy cần có công cụ GNU `timeout` hỗ trợ tùy chọn này. [GNU timeout](https://www.gnu.org/software/coreutils/manual/html_node/timeout-invocation.html).

Ghi kernel, CPU được phép, policy hiện tại, VM/host và tải nền. “Trạng thái 1” chỉ nghĩa chưa thêm tải này, không bảo đảm toàn máy rảnh. Thử hai hoặc ba lần để thấy biến động, vẫn giữ cùng mốc thời lượng và chương trình.

### 8.3. Cách đọc kết quả và điều chưa được đo

Đầu ra **minh họa**, số của máy bạn có thể khác:

```text
samples: 500 period_ms: 10.0
lateness_ms p50=0.080 p99=0.900 max=3.500
bin_ms [0,0.1) count 350
bin_ms [0.1,1) count 146
bin_ms [1,10) count 4
bin_ms [10,+inf) count 0
late_over_one_period: 0
```

Tổng bin phải bằng 500; ba số p50≤p99≤max. p99=0,9 ms nói ít nhất 495/500 mẫu không lớn hơn mẫu ở hạng đó theo cách tính, vẫn còn những mẫu lớn hơn. `max=3,5` là cực đại của mẫu này. Không có mốc trễ ≥10 ms chỉ chứng minh điều ấy trong lần đo 500 mốc.

Đo này gồm ảnh hưởng timer, chờ scheduler, việc chạy Python và thời điểm lấy đồng hồ. **Timer — bộ hẹn giờ** giúp nhân biết lúc cần đánh thức task. Độ phân giải đồng hồ in ra không là bảo đảm độ chính xác `sleep`; in `resolution` nhỏ không chứng minh độ trễ cũng nhỏ. Chương trình không đo ngắt thiết bị→cơ cấu, không chứng nhận PREEMPT_RT và không thay phép đo chuyên dụng.

Một lần có tải mà p99 thấp hơn lần ít tải không chứng minh thêm tải luôn tốt: trạng thái tiết kiệm điện, VM, các việc khác và sai số mẫu có thể đổi. Tăng thời lượng có thể tìm thêm spike, nhưng không biến phép đo thống kê thành chứng minh cận tuyệt đối.

## 9. Nếu cần so kernel RT, phải thiết kế phép đo ra sao?

**rt-tests** là bộ công cụ thử nghiệm thời gian thực, trong đó **cyclictest** đo sai lệch thức dậy định kỳ bằng mã chuyên dụng. Công cụ có nhiều tùy chọn về policy, ưu tiên, CPU và bộ nhớ, khác theo phiên bản. Chỉ đọc trước:

```bash
command -v cyclictest
cyclictest --help
man cyclictest
```

Có đường dẫn chỉ xác nhận công cụ được tìm thấy; không xác nhận kernel RT hoặc policy đang chạy. Không có lệnh thì xem gói của distro nếu cần bước nâng cao; không cần cài để hoàn thành lab Python. Đối chiếu [manual cyclictest từ gói rt-tests của Debian](https://manpages.debian.org/testing/rt-tests/cyclictest.8.en.html) với đúng bản đang cài, không chép mọi tùy chọn của trang testing cho hệ khác.

Lập ma trận trước khi đo để biết so sánh có ý nghĩa:

| Biến | Cách ghi/giữ |
|---|---|
| Phần cứng và nơi chạy | Cùng máy; phân biệt bare metal — chạy trực tiếp phần cứng — với VM |
| Kernel thực chạy và config | `uname -r`, config phù hợp; cài kernel khác chưa phải đã khởi động kernel ấy |
| Policy/ưu tiên/affinity | Ghi chính xác của luồng đo và luồng tạo tải |
| Tải | Cùng cách tạo tải CPU, lưu trữ, mạng; thử từng loại để biết nguồn ảnh hưởng |
| Chu kỳ và thời lượng | Giữ giống nhau, ghi số mẫu |
| Kết quả | Histogram, max quan sát, phân vị và số lần vượt ngưỡng ứng dụng |

Đo kernel thường và RT trên máy thử nghiệm có đường điều khiển dự phòng, theo quy trình của distro và công cụ. Nếu đo trong VM, phần host vẫn ảnh hưởng và cần ghi rõ. Không tắt RT throttling để giảm số đo; nếu thay cấu hình cần coi đó là biến mới, ghi tác động và khả năng duy trì vận hành. Bài cơ bản không yêu cầu thực hiện những thay đổi ấy.

## 10. Những lỗi thường gặp khi nói “đã đạt real-time”

| Nhầm lẫn | Cách sửa kết luận |
|---|---|
| Trung bình thấp nên luôn đúng hạn | Đọc đuôi, max quan sát, số vi phạm; cận bảo đảm cần phân tích khác |
| p99 thấp nên không còn spike | 1% còn lại vẫn có thể rất lớn; lưu cả max và histogram |
| Kernel mới hoặc có chữ rt nên chắc bật RT | Xem config/kernel thực chạy; tính năng hỗ trợ khác trạng thái bật |
| FIFO cao nhất chữa mọi chậm | Xác định chờ CPU, chờ khóa hay chờ thiết bị; phân tích toàn tuyến |
| RR chia đều mọi mức ưu tiên | RR chia lát trong cùng mức; mức cao còn có thể lấn át mức thấp |
| U dưới ngưỡng nên máy thật an toàn | Kiểm tra giả định độc lập, deadline=period, overhead, blocking và số CPU |
| Priority inheritance chữa deadlock | Nó giúp người giữ khóa chạy, không tự phá vòng chờ |
| Max trong 5 giây là WCET | Gọi đó là max đã đo, nêu tải và trạng thái chưa bao phủ |

## 11. Tự kiểm tra và phần nộp lab

1. Q=2,D=8,T=10 ms nghĩa là ứng dụng được chạy liên tục 8 ms mỗi chu kỳ? **Đối chiếu:** không; Q là ngân sách CPU, D là hạn tương đối, T là chu kỳ/khoảng cách tối thiểu.
2. Một hệ có U=0,45 nhưng khóa có thể bị giữ 10 ms. Hạn 4 ms có chắc đạt? **Đối chiếu:** không; mức yêu cầu CPU chưa tính đủ chờ tài nguyên.
3. RM có U=0,9 với hai task: có kết luận trượt hạn từ ngưỡng 0,8284 không? **Đối chiếu:** không; chỉ vượt điều kiện đủ, cần phân tích riêng.
4. H chờ khóa L giữ; M chạy trước L. Chỉ tăng H giúp không? **Đối chiếu:** H còn blocked; cần giảm thời gian giữ khóa và cơ chế thích hợp như kế thừa ưu tiên.
5. p99=0,2 ms, max=30 ms, hạn thức dậy 5 ms. Có vi phạm đã quan sát không? **Đối chiếu:** có, max đã vượt 5 ms; p99 không phủ nhận.
6. Lab Python không có mẫu trễ quá 10 ms. Có kết luận cảm biến→cơ cấu dưới 10 ms không? **Đối chiếu:** không, chưa đo các đoạn thiết bị, tính toán thật và truyền lệnh.

Nộp bảng ngân sách toàn tuyến cho một tác vụ cụ thể, hai histogram của lab, p50/p99/max và ít nhất hai giới hạn kết luận. Ghi số liệu của chính máy nếu đã chạy; không trình bày mẫu trong bài thành kết quả quan sát cá nhân.

**Tự nhắc lại:** thời gian thực là đúng hạn trong điều kiện xác định. Scheduler quyết định phần CPU; khóa, thiết bị và đường truyền quyết định những phần chờ khác. PREEMPT_RT giảm nhiều vùng khó thu hồi trong nhân, nhưng ứng dụng vẫn cần ngân sách, thiết kế và đo đúng phạm vi. Bài 21 chuyển sang lưu trữ, nơi thời gian I/O có thể chi phối toàn tuyến.

## Nguồn đối chiếu

- [sched(7)](https://man7.org/linux/man-pages/man7/sched.7.html), [sched_setattr(2)](https://man7.org/linux/man-pages/man2/sched_setattr.2.html), [SCHED_DEADLINE của kernel](https://docs.kernel.org/scheduler/sched-deadline.html).
- [Liu–Layland, Scheduling Algorithms for Multiprogramming in a Hard-Real-Time Environment, 1973](https://www.cs.ru.nl/~hooman/DES/liu-layland.pdf): điều kiện RM/EDF trong mô hình cổ điển.
- [PREEMPT_RT theory](https://docs.kernel.org/core-api/real-time/theory.html), [PREEMPT_RT differences](https://docs.kernel.org/core-api/real-time/differences.html), [giao thức mutex POSIX](https://man7.org/linux/man-pages/man3/pthread_mutexattr_setprotocol.3p.html).
- [Python time](https://docs.python.org/3/library/time.html), [cyclictest manual của rt-tests](https://manpages.debian.org/testing/rt-tests/cyclictest.8.en.html): cơ chế đo và ranh giới kết luận.
