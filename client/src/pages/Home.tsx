import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Streamdown } from "streamdown";

interface CoinAnalysis {
  greeting: string;
  outfit: string;
  color: string;
  mood: string;
  career: string;
  love: string;
  luck: string;
}

interface AnalysisResult {
  id: number;
  coinResults: number[];
  analysis: CoinAnalysis;
  isCached: boolean;
}

/**
 * 生成设备指纹
 * 优先从 localStorage 获取，如果没有则生成一个随机 UUID 并存储
 * 这样可以避免安卓 WebView 环境下硬件信息一致导致的指纹冲突
 */
function getDeviceFingerprint(): string {
  const STORAGE_KEY = 'coin_fortune_device_id';
  
  // 尝试从本地存储获取
  let fingerprint = localStorage.getItem(STORAGE_KEY);
  
  if (!fingerprint) {
    // 生成新的唯一标识 (UUID v4 风格的随机字符串)
    fingerprint = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    
    // 存储到本地
    localStorage.setItem(STORAGE_KEY, fingerprint);
  }
  
  return fingerprint;
}

// 8列 × 6行 = 48个标签，按列纵向排列
const QUESTIONS = [
  // 第一列
  "今天的天气适合出门吗？",
  "今天的穿搭打几分？",
  "今天中午吃什么？",
  "要不要喝奶茶？",
  "今晚吃啥？",
  "下班后去哪儿放松？",
  // 第二列
  "他喜欢我吗？",
  "对方是不是在敷衍我？",
  "要不要给他发消息？",
  "不回消息是生气了吗？",
  "是不是我太敏感了？",
  "求表扬",
  // 第三列
  "好像没人懂我",
  "今天适合发疯吗？",
  "想哭但又没理由怎么办？",
  "我在焦虑什么？",
  "请夸我",
  "情绪低落是为什么？",
  // 第四列
  "该不该换新手机？",
  "要不要现在下单？",
  "买这件东西是冲动消费吗？",
  "这个东西值不值？",
  "要不要报那个培训班？",
  "钱不够花怎么办？",
  // 第五列
  "我说的这句话是不是太冒失了？",
  "要不要改昵称？",
  "要不要换头像？",
  "要不要发这条朋友圈？",
  "要不要参加这次聚会？",
  "如何快速调整低落的情绪？",
  // 第六列
  "今天该做点什么？",
  "给个提升自我的小任务",
  "今天去哪玩？",
  "为什么最近总是很累？",
  "想听点好消息",
  "睡不着怎么办？",
  // 第七列
  "感觉灵感枯竭怎么办？",
  "我是不是该换工作了？",
  "我是不是又搞砸了？",
  "同事对我有意见吗？",
  "如何应对突如其来的压力？",
  "如何平衡工作和生活？",
  // 第八列
  "情侣适合去哪约会？",
  "要约会该穿什么？",
  "一个人去旅行安全吗？",
  "适合独处的好去处？",
  "如何找到适合自己的放松方式？",
  "推荐一件提升幸福感的小事"
];

// 使用次数限制提示语
const LIMIT_MESSAGES_DAYTIME = [
  "今天的智慧已耗尽，明天再继续为你出谋划策～",
  "小脑瓜冒烟啦！明天再来帮你想主意吧～",
  "今天的小困惑已经努力回答完啦，请明天再来呀～",
  "哎呀，小指南针今天转累了，明天再陪你找方向～",
  "问题超限，再问就要剧透宇宙奥秘了～明天继续哦！"
];

const LIMIT_MESSAGES_NIGHT = [
  "问题就先放一放，夜里睡个好觉，明天再一起想办法～",
  "你今天已经很努力啦，明天再继续帮你出主意，好不好～",
  "留一点小困惑给明天，就像留一点梦给星星～",
  "问题不是今天一定要解完的事，明天继续一起解锁生活～"
];

function getRandomLimitMessage(): string {
  const now = new Date();
  const hour = now.getHours();
  
  // 20:00-24:00使用夜间提示语
  if (hour >= 20) {
    return LIMIT_MESSAGES_NIGHT[Math.floor(Math.random() * LIMIT_MESSAGES_NIGHT.length)];
  } else {
    return LIMIT_MESSAGES_DAYTIME[Math.floor(Math.random() * LIMIT_MESSAGES_DAYTIME.length)];
  }
}

export default function Home() {
  const { isAuthenticated } = useAuth();
  const [deviceFingerprint, setDeviceFingerprint] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState<string>("");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<string>("");
  const [isExplanationLoading, setIsExplanationLoading] = useState(false);

  const getTodayQuery = trpc.coin.getToday.useQuery(
    { deviceFingerprint },
    { enabled: !!deviceFingerprint }
  );

  const explainQuestionMutation = trpc.coin.explainQuestion.useMutation();
  
  // 获取热门标签
  const hotQuestionsQuery = trpc.hotQuestions.getToday.useQuery();

  // 初始化设备指纹和获取今日运势
  useEffect(() => {
    // 立即更新日期显示，优先渲染界面
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const weekday = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
    const dateString = `${year}年${month}月${day}日 (周${weekday})`;
    setCurrentDate(dateString);

    // 延迟100ms生成设备指纹和查询运势，让浏览器优先渲染顶部界面
    setTimeout(() => {
      const fingerprint = getDeviceFingerprint();
      setDeviceFingerprint(fingerprint);
    }, 100);
  }, []);

  // 当查询完成时，显示结果
  useEffect(() => {
    if (getTodayQuery.data) {
      setResult(getTodayQuery.data);
      setIsLoading(false);
      setError(null);
    } else if (getTodayQuery.isLoading) {
      setIsLoading(true);
    } else if (getTodayQuery.error) {
      setIsLoading(false);
      setError('加载失败，请刷新页面重试');
    }
  }, [getTodayQuery.data, getTodayQuery.isLoading, getTodayQuery.error]);

  // 初始化轮播和下拉菜单
  useEffect(() => {
    if (!result) return;

    // 启动轮播
    const carouselText = document.getElementById('carousel-text');
    if (carouselText) {
      carouselText.textContent = QUESTIONS[currentQuestionIndex];
      carouselText.style.animation = 'fadeIn 0.5s forwards';
    }

    const carouselInterval = setInterval(() => {
      setCurrentQuestionIndex((prev) => (prev + 1) % QUESTIONS.length);
    }, 3000);

    // 设置下拉菜单
    const titleBar = document.getElementById('question-title-bar');
    const dropdownContent = document.getElementById('dropdown-content');
    const tagsContainer = document.getElementById('question-tags-container');

    if (titleBar && dropdownContent && tagsContainer) {
      // 清空之前的标签
      tagsContainer.innerHTML = '';

      // 获取热门标签列表
      const hotQuestions = hotQuestionsQuery.data?.hotQuestions || [];
      
      // 添加新标签
      QUESTIONS.forEach((q, index) => {
        const tag = document.createElement('span');
        tag.className = 'question-tag';
        tag.style.cursor = 'pointer';
        tag.style.position = 'relative'; // 为徽章定位做准备
        // 强制应用背景色和边框（兼容安卓浏览器）
        const colorIndex = (index % 4) + 1;
        if (colorIndex === 1) {
          tag.style.backgroundColor = '#ffeaea';
          tag.style.color = '#d66';
          tag.style.border = '1px solid #ffcccc';
        } else if (colorIndex === 2) {
          tag.style.backgroundColor = '#eaf3ff';
          tag.style.color = '#72a5ff';
          tag.style.border = '1px solid #cce0ff';
        } else if (colorIndex === 3) {
          tag.style.backgroundColor = '#e8fff0';
          tag.style.color = '#4db6ac';
          tag.style.border = '1px solid #c0f5d4';
        } else {
          tag.style.backgroundColor = '#fffbe9';
          tag.style.color = '#ffc107';
          tag.style.border = '1px solid #ffe6aa';
        }
        
        // 如果是热门标签，添加火焰徽章
        if (hotQuestions.includes(q)) {
          const badge = document.createElement('span');
          badge.textContent = '🔥';
          badge.style.position = 'absolute';
          badge.style.top = '-8px';
          badge.style.right = '-8px';
          badge.style.fontSize = '16px';
          badge.style.zIndex = '10';
          tag.appendChild(badge);
        }
        
        // 添加标签文字
        const textNode = document.createTextNode(q);
        tag.appendChild(textNode);

        tag.addEventListener('click', () => {
          console.log('点击了问题:', q);
          setSelectedQuestion(q);
          setExplanation(null);
          setIsExplanationLoading(true);
          explainQuestionMutation.mutate(
            { question: q, deviceFingerprint },
            {
              onSuccess: (data: any) => {
                console.log('获取到解读:', data);
                setIsExplanationLoading(false);
                if (data?.limitExceeded) {
                  setExplanation(data.message);
                } else if (data?.explanation) {
                  const explanationText = typeof data.explanation === 'string' ? data.explanation : JSON.stringify(data.explanation);
                  setExplanation(explanationText);
                } else if (data?.limitExceeded) {
                  setExplanation(getRandomLimitMessage());
                } else {
                  setExplanation('无法获取解读');
                }
              },
              onError: (error: any) => {
                console.error('获取解读失败:', error);
                setIsExplanationLoading(false);
                setExplanation('获取解读失败，请稍后再试');
              }
            }
          );
        });

        tagsContainer.appendChild(tag);
      });

      // 设置标题栏点击事件
      const handleTitleBarClick = () => {
        const isOpen = dropdownContent.classList.contains('open');
        dropdownContent.classList.toggle('open');
        titleBar.classList.toggle('active');
        
        // 如果是收起操作（之前是open，现在要关闭），清空回答框
        if (isOpen) {
          setExplanation(null);
          setIsExplanationLoading(false);
          setSelectedQuestion('');
        }
      };
      titleBar.addEventListener('click', handleTitleBarClick);

      // 清理函数：移除事件监听器
      return () => {
        clearInterval(carouselInterval);
        titleBar.removeEventListener('click', handleTitleBarClick);
      };
    }

    return () => {
      clearInterval(carouselInterval);
    };
  }, [result, explainQuestionMutation, hotQuestionsQuery.data]);

  // 更新轮播文本
  useEffect(() => {
    const carouselText = document.getElementById('carousel-text');
    if (carouselText && result) {
      carouselText.style.animation = 'fadeOut 0.3s forwards';
      setTimeout(() => {
        carouselText.textContent = QUESTIONS[currentQuestionIndex];
        carouselText.style.animation = 'fadeIn 0.5s forwards';
      }, 300);
    }
  }, [currentQuestionIndex, result]);

  // 加载状态
  if (isLoading) {
    return (
      <div className="min-h-screen" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fff7ed',
        backgroundImage: '-webkit-linear-gradient(180deg, #fff7ed 0%, #fce7f3 100%), -moz-linear-gradient(180deg, #fff7ed 0%, #fce7f3 100%), -o-linear-gradient(180deg, #fff7ed 0%, #fce7f3 100%), linear-gradient(180deg, #fff7ed 0%, #fce7f3 100%)',
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'scroll',
        minHeight: '100vh'
      }}>
        <div style={{
          textAlign: 'center',
          padding: '0 16px',
          width: '100%',
          maxWidth: '100%'
        }}>
          <div style={{
            marginBottom: '24px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            <div style={{
              position: 'relative',
              width: '120px',
              height: '120px',
              minWidth: '120px',
              minHeight: '120px'
            }}>
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                border: '6px solid #fbcfe8',
                borderRadius: '50%',
                boxSizing: 'border-box'
              }}></div>
              <div className="loading-spinner" style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                border: '6px solid #f472b6',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                boxSizing: 'border-box',
                WebkitAnimation: 'spin 1s linear infinite',
                animation: 'spin 1s linear infinite'
              }}></div>
            </div>
          </div>
          <p style={{
            color: '#4b5563',
            fontSize: '18px',
            fontWeight: 500,
            margin: 0,
            textAlign: 'center'
          }}>正在为你生成今日专属指引...</p>
        </div>
      </div>
    );
  }

  // 结果展示
  if (result) {
    return (
      <div className="min-h-screen py-6 sm:py-8" style={{
        background: '#fff7ed',
        backgroundImage: '-webkit-linear-gradient(180deg, #fff7ed 0%, #fce7f3 100%), -moz-linear-gradient(180deg, #fff7ed 0%, #fce7f3 100%), -o-linear-gradient(180deg, #fff7ed 0%, #fce7f3 100%), linear-gradient(180deg, #fff7ed 0%, #fce7f3 100%)',
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'scroll'
      }}>
        <div className="max-w-4xl mx-auto px-3 sm:px-4">
          {/* 顶部导航按钮 */}
          <div id="top-navigation">
            <a href="https://snailsleep-7edyehrw.manus.space" target="_blank" rel="noopener noreferrer" className="nav-button" id="sleep-button">
              <span className="material-icons">bedtime</span>开始助眠
            </a>
            <a href="https://goodnight-etwfsck7.manus.space" target="_blank" rel="noopener noreferrer" className="nav-button" id="goodnight-button">
              <span className="material-icons">dark_mode</span>说晚安
            </a>
          </div>

          {/* 顶部 */}
          <div className="text-left mb-8 sm:mb-12">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-pink-600 mb-2">
              {currentDate}
            </h1>
            <p className="text-gray-600 text-base sm:text-lg">
              你的今日专属指引
            </p>
          </div>

          {/* 解答小困惑功能 */}
          <div id="question-section" className="mb-8 sm:mb-10">
            <div id="question-title-bar" style={{marginTop: '-21px', marginBottom: '15px', userSelect: 'none'}}>
              <div id="question-label">
                <span className="material-icons">lightbulb</span>解答小困惑
              </div>
              <div id="carousel-text-container">
                <span id="carousel-text"></span>
              </div>
              <span className="material-icons" id="dropdown-arrow">expand_more</span>
            </div>
            <div id="dropdown-content" style={{paddingTop: '0px', paddingRight: '0px', paddingLeft: '0px'}}>
              <div id="question-tags-container" style={{
                padding: '12px',
                width: '100%',
                boxSizing: 'border-box'
              }}></div>
            </div>
            {(explanation || isExplanationLoading) && (
              <>
                {explanation && (LIMIT_MESSAGES_DAYTIME.includes(explanation) || LIMIT_MESSAGES_NIGHT.includes(explanation)) ? (
                  <div className="mt-6 mb-8 p-6 sm:p-8 bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl border-2 border-purple-300 text-center">
                    <div className="mb-4">
                      <span className="text-4xl">✨</span>
                    </div>
                    <p className="text-lg sm:text-xl font-semibold text-purple-700 leading-relaxed">
                      {explanation}
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 p-4 rounded-lg border-l-4" style={{
                    borderLeftColor: '#4eb7a2',
                    marginBottom: '16px',
                    marginTop: '0px',
                    backgroundColor: '#ffffff',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                    WebkitBoxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                  }}>
                    <h3 className="font-semibold text-base sm:text-lg mb-3" style={{color: '#4eb7a2'}}>
                      {selectedQuestion}
                    </h3>
                    {isExplanationLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 border-2 border-gray-300 border-t-[#4eb7a2] rounded-full animate-spin"></div>
                        <span className="text-sm sm:text-base text-gray-600">正在为你生成解读...</span>
                      </div>
                    ) : (
                      <Streamdown className="text-sm sm:text-base text-gray-700 leading-relaxed">
                        {explanation}
                      </Streamdown>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="mb-8 p-4 bg-red-50 border-l-4 border-red-400 rounded">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {/* 运势分析结果 - 按原始HTML的布局 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-12">
            {/* 早安心语 - 跨越全宽 */}
            <div className="md:col-span-3">
              <div className="card-interactive rounded-2xl p-4 sm:p-6 border-l-4" style={{
                borderLeftColor: '#ff9999',
                backgroundColor: '#ffffff',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                WebkitBoxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
              }}>
                <h3 className="text-base sm:text-lg font-bold mb-3 flex items-center" style={{color: '#ff9999'}}>
                  <span className="material-icons" style={{marginRight: '8px', fontSize: '24px'}}>waving_hand</span>
                  早安心语
                </h3>
                <Streamdown className="text-sm sm:text-base text-gray-700 leading-relaxed">
                  {result.analysis.greeting}
                </Streamdown>
              </div>
            </div>

            {/* 穿搭灵感 - 跨越2列 */}
            <div className="md:col-span-2">
              <div className="card-interactive rounded-2xl p-4 sm:p-6 border-l-4" style={{
                borderLeftColor: '#72a5ff',
                backgroundColor: '#ffffff',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                WebkitBoxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
              }}>
                <h3 className="text-base sm:text-lg font-bold mb-3 flex items-center" style={{color: '#72a5ff'}}>
                  <span className="material-icons" style={{marginRight: '8px', fontSize: '24px'}}>checkroom</span>
                  穿搭灵感
                </h3>
                <Streamdown className="text-sm sm:text-base text-gray-700 leading-relaxed">
                  {result.analysis.outfit}
                </Streamdown>
              </div>
            </div>

            {/* 幸运配色 - 1列 */}
            <div className="md:col-span-1">
              <div className="card-interactive bg-white rounded-2xl p-4 sm:p-6 shadow-lg border-l-4" style={{borderLeftColor: '#64dd17'}}>
                <h3 className="text-base sm:text-lg font-bold mb-3 flex items-center" style={{color: '#64dd17'}}>
                  <span className="material-icons" style={{marginRight: '8px', fontSize: '24px'}}>palette</span>
                  幸运配色
                </h3>
                <Streamdown className="text-sm sm:text-base text-gray-700 leading-relaxed">
                  {result.analysis.color}
                </Streamdown>
              </div>
            </div>

            {/* 情绪流动 - 1列 */}
            <div className="md:col-span-1">
              <div className="card-interactive bg-white rounded-2xl p-4 sm:p-6 shadow-lg border-l-4" style={{borderLeftColor: '#ffc107'}}>
                <h3 className="text-base sm:text-lg font-bold mb-3 flex items-center" style={{color: '#ffc107'}}>
                  <span className="material-icons" style={{marginRight: '8px', fontSize: '24px'}}>sentiment_satisfied</span>
                  情绪流动
                </h3>
                <Streamdown className="text-sm sm:text-base text-gray-700 leading-relaxed">
                  {result.analysis.mood}
                </Streamdown>
              </div>
            </div>

            {/* 工作指引 - 跨越2列 */}
            <div className="md:col-span-2">
              <div className="card-interactive bg-white rounded-2xl p-4 sm:p-6 shadow-lg border-l-4" style={{borderLeftColor: '#4db6ac'}}>
                <h3 className="text-base sm:text-lg font-bold mb-3 flex items-center" style={{color: '#4db6ac'}}>
                  <span className="material-icons" style={{marginRight: '8px', fontSize: '24px'}}>work</span>
                  工作指引
                </h3>
                <Streamdown className="text-sm sm:text-base text-gray-700 leading-relaxed">
                  {result.analysis.career}
                </Streamdown>
              </div>
            </div>

            {/* 情感气场 - 跨越2列 */}
            <div className="md:col-span-2">
              <div className="card-interactive bg-white rounded-2xl p-4 sm:p-6 shadow-lg border-l-4" style={{borderLeftColor: '#f48fb1'}}>
                <h3 className="text-base sm:text-lg font-bold mb-3 flex items-center" style={{color: '#f48fb1'}}>
                  <span className="material-icons" style={{marginRight: '8px', fontSize: '24px'}}>favorite</span>
                  情感气场
                </h3>
                <Streamdown className="text-sm sm:text-base text-gray-700 leading-relaxed">
                  {result.analysis.love}
                </Streamdown>
              </div>
            </div>

            {/* 幸运微光 - 1列 */}
            <div className="md:col-span-1">
              <div className="card-interactive bg-white rounded-2xl p-4 sm:p-6 shadow-lg border-l-4" style={{borderLeftColor: '#9c27b0'}}>
                <h3 className="text-base sm:text-lg font-bold mb-3 flex items-center" style={{color: '#9c27b0'}}>
                  <span className="material-icons" style={{marginRight: '8px', fontSize: '24px'}}>star</span>
                  幸运微光
                </h3>
                <Streamdown className="text-sm sm:text-base text-gray-700 leading-relaxed">
                  {result.analysis.luck}
                </Streamdown>
              </div>
            </div>
          </div>


        </div>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{
        background: '#fff7ed',
        backgroundImage: '-webkit-linear-gradient(180deg, #fff7ed 0%, #fce7f3 100%), -moz-linear-gradient(180deg, #fff7ed 0%, #fce7f3 100%), -o-linear-gradient(180deg, #fff7ed 0%, #fce7f3 100%), linear-gradient(180deg, #fff7ed 0%, #fce7f3 100%)',
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'scroll'
      }}>
        <div className="text-center p-6">
          <p className="text-red-600 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-6 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors"
          >
            刷新页面
          </button>
        </div>
      </div>
    );
  }

  return null;
}
