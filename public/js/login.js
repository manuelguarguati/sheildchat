/**
 * Login Module
 * Handles login form submission and authentication
 */

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const loginBtn = document.getElementById('loginBtn');
  const btnText = loginBtn.querySelector('.btn-text');
  const btnLoader = loginBtn.querySelector('.btn-loader');
  const errorMessage = document.getElementById('errorMessage');

  if (!loginForm) return;

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const companyDomain = document.getElementById('company_domain').value.trim();

    if (!username || !password) {
      showError('Please enter username and password');
      return;
    }

    // Show loading state
    setLoading(true);
    hideError();

    try {
      const result = await Auth.login(username, password, companyDomain);

      if (result.success) {
        const user = Auth.getUser();
        if (user && user.role === 'admin') {
          window.location.href = '/admin';
        } else {
          window.location.href = '/chat';
        }
      } else {
        showError(result.message || 'Login failed. Please try again.');
      }
    } catch (error) {
      showError(error.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  });

  /**
   * Set loading state
   */
  function setLoading(isLoading) {
    loginBtn.disabled = isLoading;
    btnText.style.display = isLoading ? 'none' : 'inline';
    btnLoader.style.display = isLoading ? 'inline' : 'none';
  }

  /**
   * Show error message
   */
  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
  }

  /**
   * Hide error message
   */
  function hideError() {
    errorMessage.style.display = 'none';
  }
});
