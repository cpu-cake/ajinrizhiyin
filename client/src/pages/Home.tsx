import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Streamdown } from "streamdown";
import { Skeleton } from "@/components/ui/skeleton";

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
  analysis: Partial<CoinAnalysis>;
  isCached: boolean;
}

// 定义字段类型
type FieldName = keyof CoinAnalysis;
const FIELD_NAMES: FieldName[] = ['greeting', 'outfit', 'color', 'mood', 'career', 'love', 'luck'];

// 每个字段的加载状态
interface FieldLoadingState {
  isLoading: boolean;
  error: string | null;
  retryCount: number;
}

// 最大重试次数
const MAX_RETRY_COUNT = 3;
// 重试延迟（毫秒）
const RETRY_DELAY = 1500;

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
  
  // 字段加载状态
  const [fieldLoadingStates, setFieldLoadingStates] = useState<Record<FieldName, FieldLoadingState>>(() => {
    const initialState: Record<FieldName, FieldLoadingState> = {} as any;
    FIELD_NAMES.forEach(field => {
      initialState[field] = { isLoading: false, error: null, retryCount: 0 };
    });
    return initialState;
  });
  
  // 用于追踪正在加载的字段，防止重复请求
  const loadingFieldsRef = useRef<Set<FieldName>>(new Set());

  const getTodayQuery = trpc.coin.getToday.useQuery(
    { deviceFingerprint },
    { 
      enabled: !!deviceFingerprint,
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    }
  );
  
  // 获取 trpc utils 用于手动调用 query
  const trpcUtils = trpc.useUtils();

  const explainQuestionMutation = trpc.coin.explainQuestion.useMutation();
  
  // 获取热门标签
  const hotQuestionsQuery = trpc.hotQuestions.getToday.useQuery();

  // 加载单个字段
  const loadField = useCallback(async (fieldName: FieldName) => {
    if (!deviceFingerprint || loadingFieldsRef.current.has(fieldName)) {
      return;
    }
    
    // 检查字段是否已经有值
    if (result?.analysis?.[fieldName]) {
      return;
    }
    
    loadingFieldsRef.current.add(fieldName);
    
    // 更新加载状态
    setFieldLoadingStates(prev => ({
      ...prev,
      [fieldName]: { ...prev[fieldName], isLoading: true, error: null }
    }));
    
    try {
      const response = await trpcUtils.coin.getField.fetch({
        deviceFingerprint,
        fieldName,
      });
      
      // 更新结果
      setResult(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          analysis: {
            ...prev.analysis,
            [fieldName]: response.value,
          }
        };
      });
      
      // 更新加载状态
      setFieldLoadingStates(prev => ({
        ...prev,
        [fieldName]: { isLoading: false, error: null, retryCount: 0 }
      }));
    } catch (err) {
      console.error(`[Field] Load ${fieldName} error:`, err);
      
      // 使用setState的回调函数来获取最新状态并处理重试
      setFieldLoadingStates(prev => {
        const currentRetryCount = prev[fieldName].retryCount;
        
        if (currentRetryCount < MAX_RETRY_COUNT) {
          // 延迟后重试
          setTimeout(() => {
            loadingFieldsRef.current.delete(fieldName);
            loadField(fieldName);
          }, RETRY_DELAY * (currentRetryCount + 1));
          
          return {
            ...prev,
            [fieldName]: { 
              isLoading: false, 
              error: '加载中...', 
              retryCount: currentRetryCount + 1 
            }
          };
        } else {
          // 重试次数已用完
          return {
            ...prev,
            [fieldName]: { 
              isLoading: false, 
              error: '加载失败，点击重试', 
              retryCount: currentRetryCount 
            }
          };
        }
      });
    } finally {
      loadingFieldsRef.current.delete(fieldName);
    }
  }, [deviceFingerprint, result, trpcUtils]);

  // 重试加载字段
  const retryLoadField = useCallback((fieldName: FieldName) => {
    setFieldLoadingStates(prev => ({
      ...prev,
      [fieldName]: { isLoading: false, error: null, retryCount: 0 }
    }));
    loadField(fieldName);
  }, [loadField]);

  // 加载所有缺失的字段
  // 分批加载：每批 2 个，批次间隔 1 秒，避免触发 LLM API 的 RPM 限制
  const loadMissingFields = useCallback(async () => {
    if (!result || !deviceFingerprint) return;
    
    // 收集需要加载的字段
    const fieldsToLoad = FIELD_NAMES.filter(fieldName => 
      !result.analysis?.[fieldName] && !loadingFieldsRef.current.has(fieldName)
    );
    
    if (fieldsToLoad.length === 0) return;
    
    // 分批加载，每批 2 个
    const BATCH_SIZE = 2;
    const BATCH_DELAY = 1000; // 1秒间隔
    
    for (let i = 0; i < fieldsToLoad.length; i += BATCH_SIZE) {
      const batch = fieldsToLoad.slice(i, i + BATCH_SIZE);
      
      // 并行加载当前批次
      batch.forEach(fieldName => {
        loadField(fieldName);
      });
      
      // 如果还有下一批，等待一段时间
      if (i + BATCH_SIZE < fieldsToLoad.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }
  }, [result, deviceFingerprint, loadField]);

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
      setResult(getTodayQuery.data as AnalysisResult);
      setIsLoading(false);
      setError(null);
    } else if (getTodayQuery.isLoading) {
      setIsLoading(true);
    } else if (getTodayQuery.error) {
      setIsLoading(false);
      setError('加载失败，请刷新页面重试');
    }
  }, [getTodayQuery.data, getTodayQuery.isLoading, getTodayQuery.error]);

  // 当result设置后，加载缺失的字段
  useEffect(() => {
    if (result && deviceFingerprint) {
      // 延迟一小段时间后开始加载字段，确保UI已渲染
      const timer = setTimeout(() => {
        loadMissingFields();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [result, deviceFingerprint, loadMissingFields]);

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
      
      // 标签颜色配置（5种颜色循环）
      const tagColors = [
        { bg: '#ffeaea', color: '#d66666', border: '#ffcccc' },  // 粉红
        { bg: '#eaf3ff', color: '#72a5ff', border: '#cce0ff' },  // 蓝色
        { bg: '#e8fff0', color: '#4db6ac', border: '#c0f5d4' },  // 绿色
        { bg: '#fffbe9', color: '#f5a623', border: '#ffe6aa' },  // 黄色
        { bg: '#f3e8ff', color: '#9c27b0', border: '#e1bee7' },  // 紫色
      ];
      
      // 添加新标签
      QUESTIONS.forEach((q, index) => {
        const tag = document.createElement('span');
        tag.className = 'question-tag';
        
        // 设置标签颜色（循环使用5种颜色）
        const colorIndex = index % tagColors.length;
        const colors = tagColors[colorIndex];
        tag.style.backgroundColor = colors.bg;
        tag.style.color = colors.color;
        tag.style.border = `1px solid ${colors.border}`;
        tag.style.cursor = 'pointer';
        tag.style.position = 'relative'; // 为徽章定位做准备
        tag.style.overflow = 'visible'; // 确保角标不被裁剪
        tag.style.zIndex = '1'; // 确保层级正确
        
        // 如果是热门标签，添加火焰徽章
        if (hotQuestions.includes(q)) {
          const badge = document.createElement('span');
          badge.textContent = '🔥';
          badge.style.position = 'absolute';
          badge.style.top = '-8px';
          badge.style.right = '-8px';
          badge.style.fontSize = '16px';
          badge.style.zIndex = '10';
          badge.style.pointerEvents = 'none'; // 防止角标阻挡点击
          badge.style.lineHeight = '1';
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

  // 渲染字段内容或加载状态
  const renderFieldContent = (fieldName: FieldName, content: string | undefined) => {
    const loadingState = fieldLoadingStates[fieldName];
    
    // 如果有内容，直接显示
    if (content) {
      return (
        <Streamdown className="text-sm sm:text-base text-gray-700 leading-relaxed">
          {content}
        </Streamdown>
      );
    }
    
    // 如果有错误且可以重试
    if (loadingState.error && loadingState.error.includes('点击重试')) {
      return (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{loadingState.error}</span>
          <button 
            onClick={() => retryLoadField(fieldName)}
            className="px-3 py-1 text-sm bg-pink-100 text-pink-600 rounded-full hover:bg-pink-200 transition-colors"
          >
            重试
          </button>
        </div>
      );
    }
    
    // 显示加载状态 - 使用内联样式确保安卓兼容性
    return (
      <div className="flex items-center gap-2">
        <div 
          className="w-5 h-5 border-2 border-gray-200 border-t-pink-400 rounded-full"
          style={{
            animation: 'spin 0.8s linear infinite',
            WebkitAnimation: 'spin 0.8s linear infinite',
          }}
        ></div>
        <span className="text-sm sm:text-base text-gray-500">正在加载你的专属指引...</span>
      </div>
    );
  };

  // 加载状态 - 显示所有卡片的骨架屏
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 to-pink-100 py-6 sm:py-8">
        <div className="max-w-4xl mx-auto px-3 sm:px-4">
          {/* 顶部导航按钮骨架 */}
          <div id="top-navigation" className="mb-6">
            <Skeleton className="h-10 w-32 inline-block mr-2" />
            <Skeleton className="h-10 w-32 inline-block" />
          </div>

          {/* 顶部标题骨架 */}
          <div className="text-left mb-8 sm:mb-12">
            <Skeleton className="h-10 w-64 mb-2" />
            <Skeleton className="h-6 w-48" />
          </div>

          {/* 今日灵感问答区域骨架 */}
          <div className="mb-8 sm:mb-10">
            <Skeleton className="h-24 w-full mb-4 rounded-lg" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>

          {/* 运势分析结果骨架 - 7个卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-12">
            {/* 早安心语 - 跨越全宽 */}
            <div className="md:col-span-3">
              <div className="rounded-2xl p-4 sm:p-6 shadow-lg bg-white">
                <Skeleton className="h-6 w-24 mb-3" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>

            {/* 穿搭灵感 - 跨越2列 */}
            <div className="md:col-span-2">
              <div className="rounded-2xl p-4 sm:p-6 shadow-lg bg-white">
                <Skeleton className="h-6 w-24 mb-3" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            </div>

            {/* 幸运配色 - 1列 */}
            <div className="md:col-span-1">
              <div className="rounded-2xl p-4 sm:p-6 shadow-lg bg-white">
                <Skeleton className="h-6 w-24 mb-3" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>

            {/* 情绪流动 - 1列 */}
            <div className="md:col-span-1">
              <div className="rounded-2xl p-4 sm:p-6 shadow-lg bg-white">
                <Skeleton className="h-6 w-24 mb-3" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            </div>

            {/* 工作指引 - 跨越2列 */}
            <div className="md:col-span-2">
              <div className="rounded-2xl p-4 sm:p-6 shadow-lg bg-white">
                <Skeleton className="h-6 w-24 mb-3" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            </div>

            {/* 情感气场 - 跨越2列 */}
            <div className="md:col-span-2">
              <div className="rounded-2xl p-4 sm:p-6 shadow-lg bg-white">
                <Skeleton className="h-6 w-24 mb-3" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            </div>

            {/* 幸运微光 - 1列 */}
            <div className="md:col-span-1">
              <div className="rounded-2xl p-4 sm:p-6 shadow-lg bg-white">
                <Skeleton className="h-6 w-24 mb-3" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 结果展示
  if (result) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 to-pink-100 py-6 sm:py-8">
        <div className="max-w-4xl mx-auto px-3 sm:px-4">
          {/* 顶部导航按钮 */}
          <div id="top-navigation">
            <a href="https://sleep.health-sleep.com/" target="_blank" rel="noopener noreferrer" className="nav-button" id="sleep-button">
              <span className="material-icons">bedtime</span>助眠动画
            </a>
            <a href="https://night.health-sleep.com" target="_blank" rel="noopener noreferrer" className="nav-button" id="goodnight-button">
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

          {/* 今日灵感问答功能 */}
          <div id="question-section" className="mb-8 sm:mb-10">
            <div id="question-title-bar" style={{marginTop: '-21px', marginBottom: '15px', userSelect: 'none'}}>
              <div id="question-label">
                <span className="material-icons" id="lightbulb-icon">lightbulb</span>今日灵感问答
              </div>
              <div id="question-second-row">
                <span id="guess-label">猜你想问：</span>
                <div id="carousel-text-container">
                  <span id="carousel-text"></span>
                </div>
              </div>
              <div id="dropdown-button">
                <span>悄悄看</span>
                <span className="material-icons" id="dropdown-arrow">expand_more</span>
              </div>
            </div>
            <div id="dropdown-content">
              <div id="question-tags-container"></div>
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
                  <div 
                    className="rounded-lg"
                    style={{
                      marginTop: '0px',
                      marginBottom: '16px',
                      padding: '16px',
                      backgroundColor: '#ffffff',
                      borderLeft: '4px solid #4eb7a2',
                      borderRadius: '8px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    }}
                  >
                    <h3 
                      className="font-semibold text-base sm:text-lg mb-3" 
                      style={{color: '#4eb7a2'}}
                    >
                      {selectedQuestion}
                    </h3>
                    {isExplanationLoading ? (
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-5 h-5 rounded-full"
                          style={{
                            width: '20px',
                            height: '20px',
                            border: '2px solid #d1d5db',
                            borderTopColor: '#4eb7a2',
                            borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite',
                            WebkitAnimation: 'spin 0.8s linear infinite',
                          }}
                        ></div>
                        <span className="text-sm sm:text-base" style={{color: '#4b5563'}}>正在为你生成解读...</span>
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

          {/* 运势分析结果 - 使用最大兼容性的内联样式 */}
          <div style={{
            display: 'block',
            width: '100%',
            marginBottom: '32px',
            paddingTop: '8px',
          }}>
            {/* 早安心语 - 全宽 */}
            <div style={{ 
              paddingBottom: '16px',
              width: '100%',
              display: 'block',
            }}>
              <div className="card-interactive" style={{
                backgroundColor: '#ffffff',
                borderLeft: '4px solid #ff9999',
                borderRadius: '16px',
                padding: '24px 16px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                WebkitBoxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              }}>
                <h3 style={{
                  fontSize: '16px',
                  fontWeight: 'bold',
                  marginBottom: '16px',
                  display: 'flex',
                  WebkitBoxAlign: 'center',
                  alignItems: 'center',
                  color: '#ff9999',
                }}>
                  <span className="material-icons" style={{marginRight: '8px', fontSize: '24px'}}>waving_hand</span>
                  早安心语
                </h3>
                <div style={{paddingTop: '4px'}}>
                  {renderFieldContent('greeting', result.analysis.greeting)}
                </div>
              </div>
            </div>

            {/* 穿搭灵感 */}
            <div style={{ 
              paddingBottom: '16px',
              width: '100%',
              display: 'block',
            }}>
              <div className="card-interactive" style={{
                backgroundColor: '#ffffff',
                borderLeft: '4px solid #72a5ff',
                borderRadius: '16px',
                padding: '24px 16px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                WebkitBoxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              }}>
                <h3 style={{
                  fontSize: '16px',
                  fontWeight: 'bold',
                  marginBottom: '16px',
                  display: 'flex',
                  WebkitBoxAlign: 'center',
                  alignItems: 'center',
                  color: '#72a5ff',
                }}>
                  <span className="material-icons" style={{marginRight: '8px', fontSize: '24px'}}>checkroom</span>
                  穿搭灵感
                </h3>
                <div style={{paddingTop: '4px'}}>
                  {renderFieldContent('outfit', result.analysis.outfit)}
                </div>
              </div>
            </div>

            {/* 幸运配色 */}
            <div style={{ 
              paddingBottom: '16px',
              width: '100%',
              display: 'block',
            }}>
              <div className="card-interactive" style={{
                backgroundColor: '#ffffff',
                borderLeft: '4px solid #64dd17',
                borderRadius: '16px',
                padding: '24px 16px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                WebkitBoxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              }}>
                <h3 style={{
                  fontSize: '16px',
                  fontWeight: 'bold',
                  marginBottom: '16px',
                  display: 'flex',
                  WebkitBoxAlign: 'center',
                  alignItems: 'center',
                  color: '#64dd17',
                }}>
                  <span className="material-icons" style={{marginRight: '8px', fontSize: '24px'}}>palette</span>
                  幸运配色
                </h3>
                <div style={{paddingTop: '4px'}}>
                  {renderFieldContent('color', result.analysis.color)}
                </div>
              </div>
            </div>

            {/* 情绪流动 */}
            <div style={{ 
              paddingBottom: '16px',
              width: '100%',
              display: 'block',
            }}>
              <div className="card-interactive" style={{
                backgroundColor: '#ffffff',
                borderLeft: '4px solid #ffc107',
                borderRadius: '16px',
                padding: '24px 16px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                WebkitBoxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              }}>
                <h3 style={{
                  fontSize: '16px',
                  fontWeight: 'bold',
                  marginBottom: '16px',
                  display: 'flex',
                  WebkitBoxAlign: 'center',
                  alignItems: 'center',
                  color: '#ffc107',
                }}>
                  <span className="material-icons" style={{marginRight: '8px', fontSize: '24px'}}>sentiment_satisfied</span>
                  情绪流动
                </h3>
                <div style={{paddingTop: '4px'}}>
                  {renderFieldContent('mood', result.analysis.mood)}
                </div>
              </div>
            </div>

            {/* 工作指引 */}
            <div style={{ 
              paddingBottom: '16px',
              width: '100%',
              display: 'block',
            }}>
              <div className="card-interactive" style={{
                backgroundColor: '#ffffff',
                borderLeft: '4px solid #4db6ac',
                borderRadius: '16px',
                padding: '24px 16px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                WebkitBoxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              }}>
                <h3 style={{
                  fontSize: '16px',
                  fontWeight: 'bold',
                  marginBottom: '16px',
                  display: 'flex',
                  WebkitBoxAlign: 'center',
                  alignItems: 'center',
                  color: '#4db6ac',
                }}>
                  <span className="material-icons" style={{marginRight: '8px', fontSize: '24px'}}>work</span>
                  工作指引
                </h3>
                <div style={{paddingTop: '4px'}}>
                  {renderFieldContent('career', result.analysis.career)}
                </div>
              </div>
            </div>

            {/* 情感气场 */}
            <div style={{ 
              paddingBottom: '16px',
              width: '100%',
              display: 'block',
            }}>
              <div className="card-interactive" style={{
                backgroundColor: '#ffffff',
                borderLeft: '4px solid #f48fb1',
                borderRadius: '16px',
                padding: '24px 16px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                WebkitBoxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              }}>
                <h3 style={{
                  fontSize: '16px',
                  fontWeight: 'bold',
                  marginBottom: '16px',
                  display: 'flex',
                  WebkitBoxAlign: 'center',
                  alignItems: 'center',
                  color: '#f48fb1',
                }}>
                  <span className="material-icons" style={{marginRight: '8px', fontSize: '24px'}}>favorite</span>
                  情感气场
                </h3>
                <div style={{paddingTop: '4px'}}>
                  {renderFieldContent('love', result.analysis.love)}
                </div>
              </div>
            </div>

            {/* 幸运微光 */}
            <div style={{ 
              paddingBottom: '16px',
              width: '100%',
              display: 'block',
            }}>
              <div className="card-interactive" style={{
                backgroundColor: '#ffffff',
                borderLeft: '4px solid #9c27b0',
                borderRadius: '16px',
                padding: '24px 16px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                WebkitBoxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              }}>
                <h3 style={{
                  fontSize: '16px',
                  fontWeight: 'bold',
                  marginBottom: '16px',
                  display: 'flex',
                  WebkitBoxAlign: 'center',
                  alignItems: 'center',
                  color: '#9c27b0',
                }}>
                  <span className="material-icons" style={{marginRight: '8px', fontSize: '24px'}}>star</span>
                  幸运微光
                </h3>
                <div style={{paddingTop: '4px'}}>
                  {renderFieldContent('luck', result.analysis.luck)}
                </div>
              </div>
            </div>
          </div>

          {/* 底部声明 */}
          <div style={{
            textAlign: 'center',
            padding: '16px 0 32px',
            color: '#9ca3af',
            fontSize: '12px',
          }}>
            以上内容由人工智能生成合成
          </div>

        </div>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-orange-50 to-pink-100">
        <div className="text-center p-6">
          <div className="text-4xl mb-4">😢</div>
          <p className="text-gray-700 mb-4">{error}</p>
          <div className="flex gap-3 justify-center">
            <button 
              onClick={() => {
                setError(null);
                setIsLoading(true);
                getTodayQuery.refetch();
              }} 
              className="px-6 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors"
            >
              点击重试
            </button>
            <button 
              onClick={() => window.location.reload()} 
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              刷新页面
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
