import Toast from 'react-native-toast-message';

export function toastSuccess(title: string, message?: string) {
  Toast.show({
    type: 'success',
    text1: title,
    text2: message,
    position: 'top',
    visibilityTime: 2800,
  });
}

export function toastError(title: string, message?: string) {
  Toast.show({
    type: 'error',
    text1: title,
    text2: message,
    position: 'top',
    visibilityTime: 4000,
  });
}

export function toastInfo(title: string, message?: string) {
  Toast.show({
    type: 'info',
    text1: title,
    text2: message,
    position: 'top',
    visibilityTime: 2600,
  });
}
