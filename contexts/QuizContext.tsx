import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface QuizQuestion {
  id: string;
  question: string;
  type: 'mcq' | 'true_false';
  options?: string[];
  correctAnswer: string;
  explanation?: string;
}

export interface Quiz {
  id: string;
  title: string;
  questions: QuizQuestion[];
  createdAt: Date;
  sourceDocument?: string;
}

export interface QuizAttempt {
  quizId: string;
  answers: { [questionId: string]: string };
  score: number;
  completedAt: Date;
}

interface QuizContextType {
  quizzes: Quiz[];
  currentQuiz: Quiz | null;
  currentQuestionIndex: number;
  userAnswers: { [questionId: string]: string };
  quizAttempts: QuizAttempt[];
  
  // Quiz management
  addQuiz: (quiz: Quiz) => Promise<void>;
  deleteQuiz: (quizId: string) => Promise<void>;
  
  // Quiz taking
  startQuiz: (quizId: string) => void;
  answerQuestion: (questionId: string, answer: string) => void;
  nextQuestion: () => void;
  previousQuestion: () => void;
  submitQuiz: () => Promise<QuizAttempt>;
  resetQuiz: () => void;
  
  // Utilities
  getQuizById: (quizId: string) => Quiz | undefined;
  getQuizAttempts: (quizId: string) => QuizAttempt[];
  refreshQuizzes: () => Promise<void>;
}

const QuizContext = createContext<QuizContextType | undefined>(undefined);

const QUIZZES_STORAGE_KEY = '@hagee_quizzes';
const QUIZ_ATTEMPTS_STORAGE_KEY = '@hagee_quiz_attempts';

export function QuizProvider({ children }: { children: React.ReactNode }) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [currentQuiz, setCurrentQuiz] = useState<Quiz | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<{ [questionId: string]: string }>({});
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);

  // Load data on mount
  useEffect(() => {
    loadQuizzes();
    loadQuizAttempts();
  }, []);

  const loadQuizzes = async () => {
    try {
      const stored = await AsyncStorage.getItem(QUIZZES_STORAGE_KEY);
      if (stored) {
        const parsedQuizzes = JSON.parse(stored).map((quiz: any) => ({
          ...quiz,
          createdAt: new Date(quiz.createdAt)
        }));
        setQuizzes(parsedQuizzes);
      }
    } catch (error) {
      console.error('Error loading quizzes:', error);
    }
  };

  const loadQuizAttempts = async () => {
    try {
      const stored = await AsyncStorage.getItem(QUIZ_ATTEMPTS_STORAGE_KEY);
      if (stored) {
        const parsedAttempts = JSON.parse(stored).map((attempt: any) => ({
          ...attempt,
          completedAt: new Date(attempt.completedAt)
        }));
        setQuizAttempts(parsedAttempts);
      }
    } catch (error) {
      console.error('Error loading quiz attempts:', error);
    }
  };

  const saveQuizzes = async (newQuizzes: Quiz[]) => {
    try {
      await AsyncStorage.setItem(QUIZZES_STORAGE_KEY, JSON.stringify(newQuizzes));
    } catch (error) {
      console.error('Error saving quizzes:', error);
    }
  };

  const saveQuizAttempts = async (attempts: QuizAttempt[]) => {
    try {
      await AsyncStorage.setItem(QUIZ_ATTEMPTS_STORAGE_KEY, JSON.stringify(attempts));
    } catch (error) {
      console.error('Error saving quiz attempts:', error);
    }
  };

  const addQuiz = async (quiz: Quiz) => {
    const newQuizzes = [quiz, ...quizzes];
    setQuizzes(newQuizzes);
    await saveQuizzes(newQuizzes);
  };

  const deleteQuiz = async (quizId: string) => {
    const newQuizzes = quizzes.filter(q => q.id !== quizId);
    setQuizzes(newQuizzes);
    await saveQuizzes(newQuizzes);
    
    // Also remove related attempts
    const newAttempts = quizAttempts.filter(a => a.quizId !== quizId);
    setQuizAttempts(newAttempts);
    await saveQuizAttempts(newAttempts);
  };

  const startQuiz = (quizId: string) => {
    const quiz = quizzes.find(q => q.id === quizId);
    if (quiz) {
      setCurrentQuiz(quiz);
      setCurrentQuestionIndex(0);
      setUserAnswers({});
    }
  };

  const answerQuestion = (questionId: string, answer: string) => {
    setUserAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));
  };

  const nextQuestion = () => {
    if (currentQuiz && currentQuestionIndex < currentQuiz.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const previousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const submitQuiz = async (): Promise<QuizAttempt> => {
    if (!currentQuiz) {
      throw new Error('No active quiz');
    }

    let correctAnswers = 0;
    currentQuiz.questions.forEach(question => {
      const userAnswer = userAnswers[question.id];
      if (userAnswer === question.correctAnswer) {
        correctAnswers++;
      }
    });

    const score = Math.round((correctAnswers / currentQuiz.questions.length) * 100);
    
    const attempt: QuizAttempt = {
      quizId: currentQuiz.id,
      answers: { ...userAnswers },
      score,
      completedAt: new Date()
    };

    const newAttempts = [attempt, ...quizAttempts];
    setQuizAttempts(newAttempts);
    await saveQuizAttempts(newAttempts);

    return attempt;
  };

  const resetQuiz = () => {
    setCurrentQuiz(null);
    setCurrentQuestionIndex(0);
    setUserAnswers({});
  };

  const getQuizById = (quizId: string) => {
    return quizzes.find(q => q.id === quizId);
  };

  const getQuizAttempts = (quizId: string) => {
    return quizAttempts.filter(a => a.quizId === quizId);
  };

  const refreshQuizzes = async () => {
    await loadQuizzes();
    await loadQuizAttempts();
  };

  const value: QuizContextType = {
    quizzes,
    currentQuiz,
    currentQuestionIndex,
    userAnswers,
    quizAttempts,
    addQuiz,
    deleteQuiz,
    startQuiz,
    answerQuestion,
    nextQuestion,
    previousQuestion,
    submitQuiz,
    resetQuiz,
    getQuizById,
    getQuizAttempts,
    refreshQuizzes,
  };

  return (
    <QuizContext.Provider value={value}>
      {children}
    </QuizContext.Provider>
  );
}

export function useQuiz() {
  const context = useContext(QuizContext);
  if (context === undefined) {
    throw new Error('useQuiz must be used within a QuizProvider');
  }
  return context;
}
