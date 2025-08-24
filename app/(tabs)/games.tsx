import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GameColors } from '@/constants/GameColors';
import { useQuiz } from '@/contexts/QuizContext';

export default function GamesScreen() {
  const { quizzes, currentQuiz, currentQuestionIndex, userAnswers, startQuiz, answerQuestion, nextQuestion, previousQuestion, submitQuiz, resetQuiz, deleteQuiz } = useQuiz();
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);

  const handleStartQuiz = (quizId: string) => {
    startQuiz(quizId);
    setSelectedAnswer(null);
  };

  const handleAnswerSelect = (answer: string) => {
    setSelectedAnswer(answer);
  };

  const handleAnswerSubmit = () => {
    if (!selectedAnswer || !currentQuiz) return;
    
    const currentQuestion = currentQuiz.questions[currentQuestionIndex];
    const isCorrect = selectedAnswer === currentQuestion.correctAnswer;
    
    answerQuestion(currentQuestion.id, selectedAnswer);
    
    // Show feedback
    Alert.alert(
      isCorrect ? '✅ Correct!' : '❌ Incorrect',
      isCorrect 
        ? 'Well done!' 
        : `The correct answer is: ${currentQuestion.correctAnswer}`,
      [
        {
          text: 'Continue',
          onPress: () => {
            setSelectedAnswer(null);
            if (currentQuestionIndex < currentQuiz.questions.length - 1) {
              nextQuestion();
            } else {
              // Quiz completed
              const correctAnswers = Object.entries(userAnswers).filter(([qId, answer]) => {
                const question = currentQuiz.questions.find(q => q.id === qId);
                return question && answer === question.correctAnswer;
              }).length + (isCorrect ? 1 : 0);
              
              Alert.alert(
                'Quiz Complete!',
                `You scored ${correctAnswers} out of ${currentQuiz.questions.length}`,
                [
                  { text: 'Submit', onPress: () => submitQuiz() },
                  { text: 'Retake', onPress: () => handleRetakeQuiz() },
                  { text: 'Review', style: 'cancel' }
                ]
              );
            }
          }
        }
      ]
    );
  };

  const handleBackToQuizzes = () => {
    resetQuiz();
    setSelectedAnswer(null);
  };

  const handleDeleteQuiz = (quizId: string, quizTitle: string) => {
    Alert.alert(
      'Delete Quiz',
      `Are you sure you want to delete "${quizTitle}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteQuiz(quizId);
              Alert.alert('Success', 'Quiz deleted successfully');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete quiz');
            }
          }
        }
      ]
    );
  };

  const handleRetakeQuiz = () => {
    if (currentQuiz) {
      resetQuiz();
      setSelectedAnswer(null);
      startQuiz(currentQuiz.id);
    }
  };

  if (currentQuiz && currentQuiz.questions && currentQuiz.questions.length > 0) {
    const currentQuestion = currentQuiz.questions[currentQuestionIndex];
    if (!currentQuestion) {
      return (
        <View style={styles.container}>
          <Text style={[styles.questionText, { color: GameColors.destructive }]}>
            Quiz question not found. Please try again.
          </Text>
          <TouchableOpacity onPress={handleBackToQuizzes} style={styles.backButton}>
            <Text style={{ color: GameColors.primary }}>Back to Quizzes</Text>
          </TouchableOpacity>
        </View>
      );
    }
    const progress = ((currentQuestionIndex + 1) / currentQuiz.questions.length) * 100;

    return (
      <View style={styles.container}>
        {/* Quiz Header */}
        <View style={styles.quizHeader}>
          <TouchableOpacity onPress={handleBackToQuizzes} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={GameColors.foreground} />
          </TouchableOpacity>
          <View style={styles.quizHeaderInfo}>
            <Text style={[styles.quizTitle, { color: GameColors.foreground }]}>
              {currentQuiz.title}
            </Text>
            <Text style={[styles.questionProgress, { color: GameColors.mutedForeground }]}>
              Question {currentQuestionIndex + 1} of {currentQuiz.questions.length}
            </Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { width: `${progress}%` }]} />
        </View>

        <ScrollView style={styles.quizContent} showsVerticalScrollIndicator={false}>
          {/* Question */}
          <View style={styles.questionCard}>
            <Text style={[styles.questionText, { color: GameColors.foreground }]}>
              {currentQuestion.question}
            </Text>
          </View>

          {/* Answer Options */}
          <View style={styles.answersContainer}>
            {currentQuestion.options?.map((option: string, index: number) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.answerOption,
                  selectedAnswer === option && styles.answerOptionSelected
                ]}
                onPress={() => handleAnswerSelect(option)}
              >
                <View style={styles.answerContent}>
                  <View style={[
                    styles.answerRadio,
                    selectedAnswer === option && styles.answerRadioSelected
                  ]}>
                    {selectedAnswer === option && (
                      <View style={styles.answerRadioInner} />
                    )}
                  </View>
                  <Text style={[
                    styles.answerText,
                    { color: selectedAnswer === option ? GameColors.primary : GameColors.foreground }
                  ]}>
                    {option}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitButton,
              !selectedAnswer && styles.submitButtonDisabled
            ]}
            onPress={handleAnswerSubmit}
            disabled={!selectedAnswer}
          >
            <Text style={[
              styles.submitButtonText,
              !selectedAnswer && styles.submitButtonTextDisabled
            ]}>
              {currentQuestionIndex < currentQuiz.questions.length - 1 ? 'Next Question' : 'Finish Quiz'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: GameColors.foreground }]}>Quiz Games</Text>
          <Text style={[styles.subtitle, { color: GameColors.mutedForeground }]}>
            Test your knowledge with interactive quizzes
          </Text>
        </View>

        {/* Quizzes List */}
        {quizzes.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="game-controller-outline" size={64} color={GameColors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: GameColors.foreground }]}>No Quizzes Yet</Text>
            <Text style={[styles.emptySubtitle, { color: GameColors.mutedForeground }]}>
              Generate quizzes in the Explore tab to start playing!
            </Text>
          </View>
        ) : (
          <View style={styles.quizzesContainer}>
            {quizzes.map((quiz) => (
              <View key={quiz.id} style={styles.quizCard}>
                <View style={styles.quizCardHeader}>
                  <Text style={[styles.quizCardTitle, { color: GameColors.foreground }]}>
                    {quiz.title}
                  </Text>
                  <View style={styles.quizCardActions}>
                    <View style={styles.quizBadge}>
                      <Ionicons name="help-circle" size={16} color={GameColors.primary} />
                      <Text style={[styles.quizBadgeText, { color: GameColors.primary }]}>
                        {quiz.questions.length}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDeleteQuiz(quiz.id, quiz.title)}
                    >
                      <Ionicons name="trash-outline" size={18} color={GameColors.destructive} />
                    </TouchableOpacity>
                  </View>
                </View>
                
                <Text style={[styles.quizCardMeta, { color: GameColors.mutedForeground }]}>
                  From: {quiz.sourceDocument} • {quiz.createdAt.toLocaleDateString()}
                </Text>

                <TouchableOpacity
                  style={styles.playButton}
                  onPress={() => handleStartQuiz(quiz.id)}
                >
                  <Ionicons name="play" size={20} color="white" />
                  <Text style={styles.playButtonText}>Start Quiz</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GameColors.background,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  quizzesContainer: {
    gap: 16,
  },
  quizCard: {
    backgroundColor: GameColors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: GameColors.border,
  },
  quizCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  quizCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  quizCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quizBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GameColors.primary + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  deleteButton: {
    padding: 4,
    borderRadius: 6,
  },
  quizBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  quizCardMeta: {
    fontSize: 14,
    marginBottom: 16,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GameColors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  playButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  // Quiz Taking Styles
  quizHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: GameColors.border,
  },
  backButton: {
    marginRight: 16,
  },
  quizHeaderInfo: {
    flex: 1,
  },
  quizTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  questionProgress: {
    fontSize: 14,
  },
  progressContainer: {
    height: 4,
    backgroundColor: GameColors.muted,
    marginHorizontal: 20,
  },
  progressBar: {
    height: '100%',
    backgroundColor: GameColors.primary,
  },
  quizContent: {
    flex: 1,
    padding: 20,
  },
  questionCard: {
    backgroundColor: GameColors.card,
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: GameColors.border,
  },
  questionText: {
    fontSize: 18,
    lineHeight: 28,
    fontWeight: '500',
  },
  answersContainer: {
    gap: 12,
    marginBottom: 32,
  },
  answerOption: {
    backgroundColor: GameColors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: GameColors.border,
  },
  answerOptionSelected: {
    borderColor: GameColors.primary,
    backgroundColor: GameColors.primary + '10',
  },
  answerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  answerRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: GameColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerRadioSelected: {
    borderColor: GameColors.primary,
  },
  answerRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: GameColors.primary,
  },
  answerText: {
    fontSize: 16,
    flex: 1,
  },
  submitButton: {
    backgroundColor: GameColors.primary,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: GameColors.muted,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  submitButtonTextDisabled: {
    color: GameColors.mutedForeground,
  },
  // True/False Question Styles
  trueFalseOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: GameColors.border,
    backgroundColor: GameColors.card,
    gap: 12,
  },
  trueOption: {
    borderColor: GameColors.success + '40',
    backgroundColor: GameColors.success + '10',
  },
  falseOption: {
    borderColor: GameColors.destructive + '40',
    backgroundColor: GameColors.destructive + '10',
  },
  trueFalseOptionSelected: {
    backgroundColor: GameColors.primary,
    borderColor: GameColors.primary,
  },
  trueFalseText: {
    fontSize: 18,
    fontWeight: '600',
  },
});
